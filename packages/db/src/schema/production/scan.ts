import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { qty } from "../../base-columns.js";
import type { ScanAction, SubcontractStatus } from "../enums.js";
import { workOrderStep } from "./work-order.js";

// Shop-floor scans, defects, and subcontracting (spec §4.2).

// Append-only scan event. `started_at`/`finished_at` on `work_order_step` derive from the
// earliest START / latest FINISH row here (design D3) — UPDATE/DELETE are rejected by the
// `production_scan_no_mutate` trigger (migration `production_scan_append_only`). `by_user`
// is a bare uuid (no FK to `user`, mirroring `auditColumns.created_by`).
export const productionScan = pgTable("production_scan", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  woStepId: uuid()
    .notNull()
    .references(() => workOrderStep.id),
  action: text().$type<ScanAction>().notNull(),
  byUser: uuid(),
  at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// A defect recorded against a step.
export const defect = pgTable("defect", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  woStepId: uuid()
    .notNull()
    .references(() => workOrderStep.id),
  type: text().notNull(),
  qty: qty().notNull(),
  note: text(),
});

// A step sent to an outside vendor. `sla_due` drives the monitor sweep's SENT -> OVERDUE
// transition (design D5); `status` starts SENT and moves to RECEIVED when the step returns
// to the line.
export const subcontract = pgTable("subcontract", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  woStepId: uuid()
    .notNull()
    .references(() => workOrderStep.id),
  vendor: text().notNull(),
  slaDue: timestamp({ withTimezone: true }),
  status: text().$type<SubcontractStatus>().notNull().default("SENT"),
});
