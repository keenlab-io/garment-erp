-- M9 subscription billing §3 (openspec/changes/m9-subscription-billing, tasks 3.1/3.2). Adds the
-- three timestamps the billing contract exposes but 0020 left out: `subscription.cancelled_at`
-- (set by cancel), `subscription_invoice.due_date` (optional, set at issue) and
-- `subscription_invoice.voided_at` (set by void). Nullable columns on existing control-plane
-- tables — the 0020 grants already cover them.
--
-- Companion down script (not journaled): tooling/drizzle-down/0021_subscription_billing_dates.down.sql
ALTER TABLE "subscription" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_invoice" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "subscription_invoice" ADD COLUMN "voided_at" timestamp with time zone;
