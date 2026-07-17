import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { qty, versionColumn } from "../../base-columns.js";
import type { WorkOrderStatus, WorkOrderStepStatus } from "../enums.js";
import { routingStep, routingTemplate } from "./routing.js";

// Work orders and their materialized steps (spec §4.2). `finished_item_id`/`customer_id` are
// bare uuids with no FK — the M3 item and (future) M5 customer tables aren't owned by this
// module (design D8); a later migration adds the constraints. Carries the optimistic-
// concurrency `version` column.
export const workOrder = pgTable("work_order", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  woNo: text().notNull().unique(),
  customerId: uuid(),
  finishedItemId: uuid().notNull(),
  qty: qty().notNull(),
  dueDate: date(),
  routingTemplateId: uuid()
    .notNull()
    .references(() => routingTemplate.id),
  machine: text(),
  mockupFileKey: text(),
  status: text().$type<WorkOrderStatus>().notNull().default("PENDING"),
  ...versionColumn,
});

// Materialized work-order step — a snapshot of the routing step's `seq`/`name`/
// `standard_time_min` at WO creation (design D1), so later template edits never mutate a
// live WO. `started_at`/`finished_at` derive from the earliest START / latest FINISH
// `production_scan` row; delay is computed in the service, not a generated column (design
// D4). `assigned_to` is a bare uuid — the M2 employee table isn't referenced here (design
// D8). `UNIQUE (wo_id, routing_step_id)`.
export const workOrderStep = pgTable(
  "work_order_step",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    woId: uuid()
      .notNull()
      .references(() => workOrder.id),
    routingStepId: uuid()
      .notNull()
      .references(() => routingStep.id),
    seq: integer().notNull(),
    name: text().notNull(),
    standardTimeMin: integer().notNull(),
    status: text().$type<WorkOrderStepStatus>().notNull().default("PENDING"),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
    assignedTo: uuid(),
    machine: text(),
    // Idempotency flag for the monitor sweep (design D5): set once when a running step
    // first exceeds its `standard_time_min` so `StepDelayed` is emitted exactly once,
    // no matter how many times the ~60s sweep re-observes the same overrun.
    delayNotified: boolean().notNull().default(false),
  },
  (t) => [unique().on(t.woId, t.routingStepId)],
);
