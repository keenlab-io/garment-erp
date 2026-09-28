import { sql } from "drizzle-orm";
import { inet, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { AuditAction } from "../enums.js";
import { platformAdmin } from "./platform-admin.js";

// Control-plane audit trail (M7 design D7) — tenant provisioned, status changed, support
// session opened/closed, platform-admin login. Mirrors `audit_log`'s columns plus the acting
// `platform_admin_id` and a NULLABLE `tenant_id` with no FK: control-plane rows must survive
// a tenant purge. Exempt from RLS; append-only is enforced by a BEFORE UPDATE OR DELETE
// trigger in the tenancy migration (same pattern as `audit_log`). `correlation_id` (M8 task
// 3.2) ties a row to the request/transaction that wrote it — the same id the domain events of
// that transaction carry.
export const platformAuditLog = pgTable("platform_audit_log", {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  platformAdminId: uuid().references(() => platformAdmin.id),
  tenantId: uuid(),
  actorUserId: uuid(),
  actorRole: text(),
  action: text().$type<AuditAction>().notNull(),
  entityType: text().notNull(),
  entityId: uuid(),
  before: jsonb(),
  after: jsonb(),
  reason: text(),
  ip: inet(),
  userAgent: text(),
  correlationId: uuid(),
});
