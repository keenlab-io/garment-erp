import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { supportSession, tenant, type Db } from "@erp/db";
import type { SupportSessionCreate, SupportSessionCreated, SupportSessionRow } from "@erp/contracts";
import { TokenService } from "../auth/token.service.js";
import {
  BusinessRuleError,
  NotFoundError,
  StateConflictError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { PlatformAuditService } from "./platform-audit.service.js";

/** Tenants a support session may be opened against — a suspended/purging tenant rejects every request. */
const SUPPORTABLE = new Set(["ACTIVE", "READ_ONLY"]);

type SessionRecord = typeof supportSession.$inferSelect;

const toRow = (r: SessionRecord): SupportSessionRow => ({
  id: r.id,
  tenant_id: r.tenantId,
  reason: r.reason,
  expires_at: r.expiresAt.toISOString(),
  revoked_at: r.revokedAt?.toISOString() ?? null,
  created_at: r.createdAt.toISOString(),
});

/**
 * Support sessions (M7 design D6) — the only way a platform admin enters a tenant. Opening one
 * requires a reason and a time box (`expires_at`), writes `platform_audit_log`, and mints a
 * tenant-scoped access token whose claims carry `tid` (the target tenant) and `sup` (the session
 * id), expiring with the session. `JwtGuard` validates `sup` tokens against the session row, so
 * revocation or expiry kills the token on its next request; while it lives, `AuditService`
 * dual-writes every audited action into the tenant's `audit_log` and `platform_audit_log`.
 * Tokens are non-renewable (design OQ2): open a new session, get a new audit row.
 */
@Injectable()
export class SupportSessionService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly tokens: TokenService,
    private readonly audit: PlatformAuditService,
  ) {}

  async create(
    input: SupportSessionCreate,
    platformAdminId: string,
  ): Promise<SupportSessionCreated> {
    const reason = input.reason.trim();
    if (!reason) throw new BusinessRuleError("A reason is required to open a support session");

    const tokenId = randomUUID();
    const expiresAt = new Date(Date.now() + input.minutes * 60_000);

    const row = await this.uow.withTransaction(async (tx) => {
      const [target] = await tx
        .select({ status: tenant.status })
        .from(tenant)
        .where(eq(tenant.id, input.tenant_id))
        .limit(1);
      if (!target) throw new NotFoundError("Tenant not found");
      if (!SUPPORTABLE.has(target.status)) {
        throw new BusinessRuleError(`Tenant is ${target.status}; support sessions are not allowed`);
      }

      const [created] = await tx
        .insert(supportSession)
        .values({ platformAdminId, tenantId: input.tenant_id, reason, tokenId, expiresAt })
        .returning();
      const session = created as SessionRecord;

      await this.audit.append({
        action: "CREATE",
        entityType: "support_session",
        entityId: session.id,
        tenantId: session.tenantId,
        platformAdminId,
        after: { expires_at: session.expiresAt.toISOString(), minutes: input.minutes },
        reason,
      });
      return session;
    });

    const accessToken = await this.tokens.signAccess(
      { sub: platformAdminId, sid: tokenId, pv: 0, tid: row.tenantId, sup: row.id },
      { expiresIn: input.minutes * 60 },
    );
    return { support_session: toRow(row), access_token: accessToken };
  }

  /** Revoke a live session; its token is refused from the next request on. */
  async revoke(id: string, platformAdminId: string): Promise<void> {
    await this.uow.withTransaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(supportSession)
        .where(eq(supportSession.id, id))
        .limit(1);
      if (!existing) throw new NotFoundError("Support session not found");

      const [revoked] = await tx
        .update(supportSession)
        .set({ revokedAt: new Date() })
        .where(and(eq(supportSession.id, id), isNull(supportSession.revokedAt)))
        .returning();
      if (!revoked) throw new StateConflictError("Support session is already revoked");

      await this.audit.append({
        action: "UPDATE",
        entityType: "support_session",
        entityId: id,
        tenantId: revoked.tenantId,
        platformAdminId,
        before: { revoked_at: null },
        after: { revoked_at: revoked.revokedAt?.toISOString() ?? null },
      });
    });
  }
}
