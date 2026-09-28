import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, getTableColumns, gte, lte, sql } from "drizzle-orm";
import { platformAuditLog, type Db } from "@erp/db";
import type { AuditAction, PlatformAuditRow } from "@erp/contracts";
import { tryDecodeCursor } from "@erp/utils";
import { buildPage } from "../common/pagination/cursor.js";
import { DB } from "../db/db.tokens.js";
import { currentCorrelationId, currentExecutor } from "../db/tx-context.js";

/** A control-plane action to append to `platform_audit_log`. */
export interface PlatformAuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  platformAdminId?: string | null;
  tenantId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  /** Defaults to the active transaction's correlation id (see `currentCorrelationId`). */
  correlationId?: string | null;
}

/** Filters accepted by `GET /platform/audit`. */
export interface PlatformAuditFilters {
  limit: number;
  cursor?: string;
  entity_type?: string;
  entity_id?: string;
  tenant_id?: string;
  from?: string;
  to?: string;
}

interface PlatformAuditCursor {
  at: string;
  id: string;
}

/**
 * The control-plane audit trail (M7 design D7, M8 task 3.2) — tenant provisioned, status changed,
 * support session opened/closed, platform-admin login/logout. Every row names the acting platform
 * admin, the action, the target tenant, before/after payloads, and a correlation id (the writing
 * transaction's, so it matches the domain events of the same unit of work). `append` uses
 * `currentExecutor`, so a call inside a transaction is atomic with the action it records; the table is append-only at the DB level
 * (trigger + revoked UPDATE/DELETE). `list` is the cursor-paginated, newest-first read the
 * platform surface exposes. `platform_audit_log` is exempt from tenancy/RLS, so neither path
 * needs a tenant in scope.
 */
@Injectable()
export class PlatformAuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async append(entry: PlatformAuditEntry): Promise<void> {
    await currentExecutor(this.db)
      .insert(platformAuditLog)
      .values({
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        platformAdminId: entry.platformAdminId ?? null,
        tenantId: entry.tenantId ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
        reason: entry.reason ?? null,
        correlationId: entry.correlationId ?? currentCorrelationId(),
      });
  }

  async list(
    filters: PlatformAuditFilters,
  ): Promise<{ data: PlatformAuditRow[]; next_cursor: string | null }> {
    const decoded = filters.cursor
      ? (tryDecodeCursor(filters.cursor) as PlatformAuditCursor | null)
      : null;

    const where = [
      filters.entity_type ? eq(platformAuditLog.entityType, filters.entity_type) : undefined,
      filters.entity_id ? eq(platformAuditLog.entityId, filters.entity_id) : undefined,
      filters.tenant_id ? eq(platformAuditLog.tenantId, filters.tenant_id) : undefined,
      filters.from ? gte(platformAuditLog.at, new Date(filters.from)) : undefined,
      filters.to ? lte(platformAuditLog.at, new Date(filters.to)) : undefined,
      // The cursor carries `at` as Postgres text (microsecond-exact — a JS Date would truncate
      // to milliseconds and skip same-millisecond rows).
      decoded
        ? sql`(${platformAuditLog.at}, ${platformAuditLog.id}) < (${decoded.at}::timestamptz, ${decoded.id}::uuid)`
        : undefined,
    ].filter(Boolean);

    const rows = await currentExecutor(this.db)
      .select({
        ...getTableColumns(platformAuditLog),
        cursorAt: sql<string>`${platformAuditLog.at}::text`,
      })
      .from(platformAuditLog)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(platformAuditLog.at), desc(platformAuditLog.id))
      .limit(filters.limit + 1);

    const page = buildPage(rows, filters.limit, (r) => ({ at: r.cursorAt, id: r.id }));

    return {
      data: page.data.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        platform_admin_id: r.platformAdminId,
        action: r.action,
        entity_type: r.entityType,
        entity_id: r.entityId,
        tenant_id: r.tenantId,
        reason: r.reason,
        before: r.before,
        after: r.after,
        correlation_id: r.correlationId,
      })),
      next_cursor: page.next_cursor,
    };
  }
}
