-- DOWN script for 0016_platform_session.sql — NOT journaled, never run by the migrator.
-- Run by hand as a superuser, then delete the 0016 row from drizzle.__drizzle_migrations.
BEGIN;
DROP TABLE IF EXISTS "platform_session";
ALTER TABLE "platform_audit_log" DROP COLUMN IF EXISTS "correlation_id";
COMMIT;
