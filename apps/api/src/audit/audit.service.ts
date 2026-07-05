import { Inject, Injectable } from "@nestjs/common";
import { auditLog, type Db } from "@erp/db";
import type { AuditAction } from "@erp/contracts";
import { BusinessRuleError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";

/** A row to append to the audit log. `actorUserId` defaults from the event actor. */
export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Writes append-only audit rows. Uses `currentExecutor`, so a `record` called
 * inside a transaction (e.g. from the audit subscriber during
 * `publishInTransaction`) lands in the same tx and is atomic with the mutation.
 * DB-level immutability is enforced by the `audit_append_only` trigger.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async record(entry: AuditEntry): Promise<void> {
    await currentExecutor(this.db).insert(auditLog).values({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      actorUserId: entry.actorUserId ?? null,
      actorRole: entry.actorRole ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      reason: entry.reason ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    });
  }

  /**
   * Assert a justification is present for reason-required actions (stock
   * adjustment, void, permission change, payroll approval). Throws 422 on blank.
   */
  requireReason(reason: string | null | undefined): string {
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new BusinessRuleError("A reason is required for this action");
    }
    return trimmed;
  }
}
