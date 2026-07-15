import { boolean, pgTable, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { auditColumns, versionColumn } from "../../base-columns.js";

// RBAC role (spec §1.2). `name` is unique; `is_system` marks the built-in roles that
// can never be deleted (M1 design D6). `cloned_from` records the source role when a
// role is deep-copied via `POST /roles/{id}/clone` — a self-referential FK, so the
// `AnyPgColumn` return annotation breaks the circular type inference (same pattern as
// `user.created_by`). Spreads the shared audit + optimistic-concurrency columns.
export const role = pgTable("role", {
  ...auditColumns,
  name: text().notNull().unique(),
  description: text(),
  isSystem: boolean().notNull().default(false),
  clonedFrom: uuid().references((): AnyPgColumn => role.id),
  ...versionColumn,
});
