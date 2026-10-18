import { date, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditColumns, money, versionColumn } from "../../base-columns.js";
import type { SubscriptionInvoiceStatus, SubscriptionPaymentMethod } from "../enums.js";
import { subscription } from "./subscription.js";
import { tenant } from "./tenant.js";

// Vendor-side invoice for a subscription (M9 design D2/D7) — NOT the tenant-facing M5 `invoice`.
// TENANT_EXEMPT (no `tenant_id`, no RLS). `number` is `SINV-{YYYY}-{seq}` from the control-plane
// `subscription_invoice_seq` Postgres sequence (migration 0020). `lines` is a jsonb array of
// `{kind, description, amount}` (discount negative); totals are denormalized, ex-VAT. The
// `paid_*` fields are set together by mark-paid; `voided_at` by void (migration 0021).
export const subscriptionInvoice = pgTable(
  "subscription_invoice",
  {
    ...auditColumns,
    number: text().notNull().unique(),
    subscriptionId: uuid()
      .notNull()
      .references(() => subscription.id),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    lines: jsonb().notNull().default([]),
    subtotal: money().notNull(),
    total: money().notNull(),
    status: text().$type<SubscriptionInvoiceStatus>().notNull().default("ISSUED"),
    issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    dueDate: date(),
    periodStart: timestamp({ withTimezone: true }),
    periodEnd: timestamp({ withTimezone: true }),
    paidAt: timestamp({ withTimezone: true }),
    paidMethod: text().$type<SubscriptionPaymentMethod>(),
    paidReference: text(),
    paidAmount: money(),
    voidedAt: timestamp({ withTimezone: true }),
    ...versionColumn,
  },
  (t) => [index("subscription_invoice_subscription_idx").on(t.subscriptionId)],
);
