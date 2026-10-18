import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, money, versionColumn } from "../../base-columns.js";
import type { SubscriptionStatus } from "../enums.js";
import { plan } from "./plan.js";
import { tenant } from "./tenant.js";

// Control-plane subscription (M9 design D1/D3/D5) — the commercial term a tenant is paying
// for. TENANT_EXEMPT (no `tenant_id`, no RLS): the tenant is a FK *target* here, not the row's
// scope, and the dunning sweep reads every row. At most one non-CANCELLED subscription per
// tenant (partial unique index). `annual_fee` is the negotiated fee (plan holds list ranges);
// `term_end` only moves when an invoice is marked paid. `dunning_events` is the persisted list
// of reminder touches so a restarted sweep never double-sends.
export const subscription = pgTable(
  "subscription",
  {
    ...auditColumns,
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    planId: uuid()
      .notNull()
      .references(() => plan.id),
    annualFee: money().notNull(),
    termStart: timestamp({ withTimezone: true }).notNull(),
    termEnd: timestamp({ withTimezone: true }).notNull(),
    status: text().$type<SubscriptionStatus>().notNull().default("ACTIVE"),
    dunningEvents: jsonb().notNull().default([]),
    cancelledAt: timestamp({ withTimezone: true }),
    ...versionColumn,
  },
  (t) => [
    uniqueIndex("subscription_tenant_active_uq")
      .on(t.tenantId)
      .where(sql`${t.status} <> 'CANCELLED' AND ${t.deletedAt} IS NULL`),
  ],
);
