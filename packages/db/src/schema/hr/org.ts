import { pgTable, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { auditColumns, tenantColumn } from "../../base-columns.js";
import { tenantFk } from "../platform/tenant.js";

// Org structure (spec §2.2): the department tree and job positions. Both spread the
// shared audit columns; the domain here is small (no optimistic-concurrency version).

// Department. `parent_id` is a self-referential FK forming the org tree (null at the root);
// the `AnyPgColumn` return annotation breaks the circular type inference drizzle would hit
// for a same-table reference (same pattern as `role.cloned_from`).
export const department = pgTable(
  "department",
  {
    ...auditColumns,
    ...tenantColumn,
    name: text().notNull(),
    parentId: uuid().references((): AnyPgColumn => department.id),
  },
  (t) => [tenantFk(t)],
);

// Job position. `department_id` FK ties it to its owning department; `job_description` is
// free-form prose.
export const position = pgTable(
  "position",
  {
    ...auditColumns,
    ...tenantColumn,
    title: text().notNull(),
    jobDescription: text(),
    departmentId: uuid()
      .notNull()
      .references(() => department.id),
  },
  (t) => [tenantFk(t)],
);
