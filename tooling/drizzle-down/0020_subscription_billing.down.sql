-- DOWN script for 0020_subscription_billing.sql — NOT journaled, never run by the migrator.
-- Run by hand as a superuser, then delete the 0020 row from drizzle.__drizzle_migrations.
BEGIN;
DROP TABLE IF EXISTS "subscription_invoice";
DROP TABLE IF EXISTS "subscription";
DROP SEQUENCE IF EXISTS "subscription_invoice_seq";
ALTER TABLE "plan" DROP COLUMN IF EXISTS "setup_fee_max";
ALTER TABLE "plan" DROP COLUMN IF EXISTS "setup_fee_min";
ALTER TABLE "plan" DROP COLUMN IF EXISTS "annual_fee_max";
ALTER TABLE "plan" DROP COLUMN IF EXISTS "annual_fee_min";
COMMIT;
