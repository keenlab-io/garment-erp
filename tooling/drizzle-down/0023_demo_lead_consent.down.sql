-- DOWN script for 0023_demo_lead_consent.sql — NOT journaled, never run by the migrator.
-- Run by hand as a superuser, then delete the 0023 row from drizzle.__drizzle_migrations.
BEGIN;
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "demo_guest_name";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "demo_lead_consented_at";
COMMIT;
