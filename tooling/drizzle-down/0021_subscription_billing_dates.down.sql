-- DOWN script for 0021_subscription_billing_dates.sql — NOT journaled, never run by the migrator.
-- Run by hand as a superuser, then delete the 0021 row from drizzle.__drizzle_migrations.
BEGIN;
ALTER TABLE "subscription_invoice" DROP COLUMN IF EXISTS "voided_at";
ALTER TABLE "subscription_invoice" DROP COLUMN IF EXISTS "due_date";
ALTER TABLE "subscription" DROP COLUMN IF EXISTS "cancelled_at";
COMMIT;
