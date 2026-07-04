import { sql } from "drizzle-orm";
import { inet, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { AuditAction } from "../enums.js";

// Central append-only audit table (spec §1.2). Append-only is enforced at the DB
// level by a BEFORE UPDATE OR DELETE trigger (custom migration audit_append_only),
// not by the table definition — so immutability holds even for the table owner.
export const auditLog = pgTable("audit_log", {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  at: timestamp({ withTimezone: true }).notNull().defaultNow(),
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
});
