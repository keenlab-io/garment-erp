import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { auditLog, type Db } from "@erp/db";
import type { AuditEntry } from "@erp/contracts";
import { tryDecodeCursor } from "@erp/utils";
import { buildPage } from "../common/pagination/cursor.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";

/** Filters accepted by `GET /audit`. */
export interface AuditFilters {
  limit: number;
  cursor?: string;
  entity_type?: string;
  entity_id?: string;
  actor?: string;
  from?: string;
  to?: string;
}

interface AuditCursor {
  at: string;
  id: string;
}

/**
 * Read path over M0's append-only `audit_log` (spec §1.5). Cursor-paginated, newest
 * first, with the spec's entity/actor/time filters. The log itself is written by the
 * `AuditSubscriber`; this service only queries it.
 */
@Injectable()
export class AuditQueryService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(
    filters: AuditFilters,
  ): Promise<{ data: AuditEntry[]; next_cursor: string | null }> {
    const decoded = filters.cursor
      ? (tryDecodeCursor(filters.cursor) as AuditCursor | null)
      : null;

    const where = [
      filters.entity_type ? eq(auditLog.entityType, filters.entity_type) : undefined,
      filters.entity_id ? eq(auditLog.entityId, filters.entity_id) : undefined,
      filters.actor ? eq(auditLog.actorUserId, filters.actor) : undefined,
      filters.from ? gte(auditLog.at, new Date(filters.from)) : undefined,
      filters.to ? lte(auditLog.at, new Date(filters.to)) : undefined,
      decoded
        ? sql`(${auditLog.at}, ${auditLog.id}) < (${new Date(decoded.at)}, ${decoded.id})`
        : undefined,
    ].filter(Boolean);

    const rows = await currentExecutor(this.db)
      .select()
      .from(auditLog)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(filters.limit + 1);

    const page = buildPage(rows, filters.limit, (r) => ({
      at: r.at.toISOString(),
      id: r.id,
    }));

    const data: AuditEntry[] = page.data.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      actor_user_id: r.actorUserId,
      actor_role: r.actorRole,
      action: r.action,
      entity_type: r.entityType,
      entity_id: r.entityId,
      before: r.before,
      after: r.after,
      reason: r.reason,
    }));

    return { data, next_cursor: page.next_cursor };
  }
}
