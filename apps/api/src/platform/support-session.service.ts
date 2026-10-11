import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { supportSession, tenant, type Db } from "@erp/db";
import type {
  SupportSessionCreate,
  SupportSessionCreated,
  SupportSessionRow,
} from "@erp/contracts";
import { tryDecodeCursor } from "@erp/utils";
import { AuditService, type AuditEntry } from "../audit/audit.service.js";
import { TokenService } from "../auth/token.service.js";
import {
  BusinessRuleError,
  NotFoundError,
  StateConflictError,
  ValidationError,
} from "../common/errors/app-exception.js";
import { buildPage } from "../common/pagination/cursor.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { runWithTenant, tenantContext } from "../tenancy/tenant-context.js";

/** Tenants a support session may be opened against — a suspended/purging tenant rejects every request. */
const SUPPORTABLE = new Set(["ACTIVE", "READ_ONLY"]);

type SessionRecord = typeof supportSession.$inferSelect;

const toRow = (r: SessionRecord): SupportSessionRow => ({
  id: r.id,
  tenant_id: r.tenantId,
  platform_admin_id: r.platformAdminId,
  reason: r.reason,
  scope: r.scope,
  expires_at: r.expiresAt.toISOString(),
  revoked_at: r.revokedAt?.toISOString() ?? null,
  created_at: r.createdAt.toISOString(),
});

/** Filters accepted by `GET /platform/support-sessions`. */
export interface SupportSessionFilters {
  limit: number;
  cursor?: string;
  tenant_id?: string;
}

interface SupportSessionCursor {
  created_at: string;
  id: string;
}

/**
 * Support sessions (M7 design D6, M8 design D8) — the only way a platform admin enters a tenant.
 * Opening one requires a non-blank reason, a scope (`READ_ONLY | FULL`), and a time box of at most
 * `SUPPORT_SESSION_MAX_MINUTES` (default `SUPPORT_SESSION_DEFAULT_MINUTES`); it mints a
 * tenant-scoped access token whose claims carry `tid` (the target tenant) and `sup` (the session
 * id), expiring with the session — there is no refresh token, expiry IS the time box. `JwtGuard`
 * validates `sup` tokens against the session row, so ending the session early or letting it
 * expire kills the token on its next request; while it lives, `AuditService` dual-writes every
 * audited action into the tenant's `audit_log` and `platform_audit_log`, both stamped with the
 * session id. Opening and ending the session are themselves recorded in BOTH ledgers, so the
 * customer sees support arrive and leave in their own audit log.
 */
@Injectable()
export class SupportSessionService {
  private readonly defaultMinutes: number;
  private readonly maxMinutes: number;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly tokens: TokenService,
    private readonly ledger: AuditService,
    config: ConfigService,
  ) {
    this.maxMinutes = config.get<number>("SUPPORT_SESSION_MAX_MINUTES") ?? 240;
    this.defaultMinutes = Math.min(
      config.get<number>("SUPPORT_SESSION_DEFAULT_MINUTES") ?? 60,
      this.maxMinutes,
    );
  }

  async create(
    input: SupportSessionCreate,
    platformAdminId: string,
  ): Promise<SupportSessionCreated> {
    const reason = input.reason.trim();
    if (!reason) {
      throw new ValidationError("A reason is required to open a support session", [
        { field: "reason", issue: "required" },
      ]);
    }
    const minutes = input.minutes ?? this.defaultMinutes;
    if (minutes > this.maxMinutes) {
      throw new ValidationError(`A support session may last at most ${this.maxMinutes} minutes`, [
        { field: "minutes", issue: `must be ≤ ${this.maxMinutes}` },
      ]);
    }

    const tokenId = randomUUID();
    const expiresAt = new Date(Date.now() + minutes * 60_000);

    // The target tenant is entered so the tenant-ledger row satisfies its RLS policy.
    const row = await runWithTenant(input.tenant_id, "system", () =>
      this.uow.withTransaction(async (tx) => {
        const [target] = await tx
          .select({ status: tenant.status })
          .from(tenant)
          .where(eq(tenant.id, input.tenant_id))
          .limit(1);
        if (!target) throw new NotFoundError("Tenant not found");
        if (!SUPPORTABLE.has(target.status)) {
          throw new BusinessRuleError(
            `Tenant is ${target.status}; support sessions are not allowed`,
          );
        }

        const [created] = await tx
          .insert(supportSession)
          .values({
            platformAdminId,
            tenantId: input.tenant_id,
            reason,
            scope: input.scope,
            tokenId,
            expiresAt,
          })
          .returning();
        const session = created as SessionRecord;

        await this.recordInBothLedgers(session, {
          action: "CREATE",
          entityType: "support_session",
          entityId: session.id,
          actorUserId: platformAdminId,
          after: {
            scope: session.scope,
            expires_at: session.expiresAt.toISOString(),
            minutes,
          },
          reason,
        });
        return session;
      }),
    );

    const accessToken = await this.tokens.signAccess(
      { sub: platformAdminId, sid: tokenId, pv: 0, tid: row.tenantId, sup: row.id },
      { expiresIn: minutes * 60 },
    );
    return { support_session: toRow(row), access_token: accessToken };
  }

  /** End a live session early; its token is refused from the next request on. */
  async revoke(id: string, platformAdminId: string): Promise<void> {
    const [existing] = await currentExecutor(this.db)
      .select()
      .from(supportSession)
      .where(eq(supportSession.id, id))
      .limit(1);
    if (!existing) throw new NotFoundError("Support session not found");

    await runWithTenant(existing.tenantId, "system", () =>
      this.uow.withTransaction(async (tx) => {
        const [revoked] = await tx
          .update(supportSession)
          .set({ revokedAt: new Date() })
          .where(and(eq(supportSession.id, id), isNull(supportSession.revokedAt)))
          .returning();
        if (!revoked) throw new StateConflictError("Support session is already revoked");

        await this.recordInBothLedgers(revoked, {
          action: "UPDATE",
          entityType: "support_session",
          entityId: id,
          actorUserId: platformAdminId,
          before: { revoked_at: null },
          after: { revoked_at: revoked.revokedAt?.toISOString() ?? null },
        });
      }),
    );
  }

  /** Support sessions newest-first, optionally for one tenant. */
  async list(
    filters: SupportSessionFilters,
  ): Promise<{ data: SupportSessionRow[]; next_cursor: string | null }> {
    const decoded = filters.cursor
      ? (tryDecodeCursor(filters.cursor) as SupportSessionCursor | null)
      : null;
    const where = [
      filters.tenant_id ? eq(supportSession.tenantId, filters.tenant_id) : undefined,
      // `created_at` travels as Postgres text: microsecond-exact, unlike a JS Date.
      decoded
        ? sql`(${supportSession.createdAt}, ${supportSession.id}) < (${decoded.created_at}::timestamptz, ${decoded.id}::uuid)`
        : undefined,
    ].filter(Boolean);

    const rows = await currentExecutor(this.db)
      .select({ session: supportSession, cursorAt: sql<string>`${supportSession.createdAt}::text` })
      .from(supportSession)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(supportSession.createdAt), desc(supportSession.id))
      .limit(filters.limit + 1);

    const page = buildPage(rows, filters.limit, (r) => ({
      created_at: r.cursorAt,
      id: r.session.id,
    }));
    return { data: page.data.map((r) => toRow(r.session)), next_cursor: page.next_cursor };
  }

  /**
   * Record a session lifecycle event under the session's own support scope, so `AuditService`
   * writes it to the tenant's `audit_log` AND `platform_audit_log`, both tagged with the session id.
   */
  private recordInBothLedgers(session: SessionRecord, entry: AuditEntry): Promise<void> {
    return tenantContext.run(
      {
        tenantId: session.tenantId,
        source: "system",
        support: {
          supportSessionId: session.id,
          platformAdminId: session.platformAdminId,
          scope: session.scope,
        },
      },
      () => this.ledger.record(entry),
    );
  }
}
