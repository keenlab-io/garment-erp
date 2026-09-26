import { sql } from "drizzle-orm";
import {
  customType,
  date,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { auditColumns, tenantColumn, versionColumn } from "../../base-columns.js";
import { tenantFk } from "../platform/tenant.js";
import type { EmployeeDocumentType, EmployeeStatus, EmploymentType } from "../enums.js";
import { position } from "./org.js";

// Postgres `bytea` — raw binary column for encrypted PII (ciphertext = `iv‖tag‖ct`,
// AES-256-GCM, produced by the service-layer crypto helper). The value round-trips as a
// Node `Buffer` through postgres.js.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

// Employee master (spec §2.2). `emp_code` is auto-issued (`EXT0001`) via SequenceService on
// create and is unique. `national_id_enc` holds **encrypted** PII (never plaintext); the
// `profile` jsonb bag carries contact/emergency/bank fields with the sensitive ones
// encrypted at the service layer. `status` defaults to PROBATION. Spreads the shared audit +
// optimistic-concurrency columns.
export const employee = pgTable(
  "employee",
  {
    ...auditColumns,
    ...tenantColumn,
    empCode: text().notNull(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    nationalIdEnc: bytea(),
    profile: jsonb().notNull().default({}),
    positionId: uuid().references(() => position.id),
    employmentType: text().$type<EmploymentType>().notNull(),
    status: text().$type<EmployeeStatus>().notNull().default("PROBATION"),
    hireDate: date().notNull(),
    probationEndDate: date(),
    ...versionColumn,
  },
  (t) => [
    tenantFk(t),
    unique("employee_tenant_emp_code_uq").on(t.tenantId, t.empCode),
  ],
);

// Reporting line (spec §2.2). One row per employee (PK `employee_id`); `manager_employee_id`
// is a self-referential FK into `employee`. Kept separate from `employee` so the tree can be
// re-parented without touching the master row.
export const reportingLine = pgTable(
  "reporting_line",
  {
    ...tenantColumn,
    employeeId: uuid()
      .primaryKey()
      .references(() => employee.id),
    managerEmployeeId: uuid().references((): AnyPgColumn => employee.id),
  },
  (t) => [tenantFk(t)],
);

// Employee document (spec §2.2). `file_key` is the object-storage key — files are reachable
// only via signed URLs, never served inline. `type` is the document classification enum.
export const employeeDocument = pgTable(
  "employee_document",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    employeeId: uuid()
      .notNull()
      .references(() => employee.id),
    type: text().$type<EmployeeDocumentType>().notNull(),
    fileKey: text().notNull(),
    uploadedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [tenantFk(t)],
);
