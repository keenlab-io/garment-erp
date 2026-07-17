import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import type { ProductType } from "../enums.js";

// Routing templates and their ordered steps (spec §4.2). A template is a reusable production
// recipe; work orders materialize (snapshot) its steps at creation time so later template
// edits never mutate a live work order (design D1).

// Routing template header. `product_type` classifies the routing (nullable — not every
// template maps to one product type); `is_active` hides retired templates from new WOs.
export const routingTemplate = pgTable("routing_template", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text().notNull(),
  productType: text().$type<ProductType>(),
  isActive: boolean().notNull().default(true),
});

// Routing step. `standard_time_min` is the expected duration used for delay detection at
// scan time. `department_id` is a bare uuid — the M2/M3 department table doesn't exist yet
// (design D8); the FK is added by a later migration. `UNIQUE (template_id, seq)` orders and
// de-duplicates steps within a template.
export const routingStep = pgTable(
  "routing_step",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    templateId: uuid()
      .notNull()
      .references(() => routingTemplate.id),
    seq: integer().notNull(),
    name: text().notNull(),
    standardTimeMin: integer().notNull(),
    departmentId: uuid(),
  },
  (t) => [unique().on(t.templateId, t.seq)],
);
