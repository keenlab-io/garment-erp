-- DOWN script for 0022_public_demo.sql — NOT journaled, never run by the migrator.
-- Run by hand as a superuser, then delete the 0022 row from drizzle.__drizzle_migrations.
BEGIN;
DROP TABLE IF EXISTS "auth_identity";
DROP TABLE IF EXISTS "demo_lead";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "allow_self_signup";
COMMIT;
