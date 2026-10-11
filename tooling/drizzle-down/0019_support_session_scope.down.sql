-- DOWN script for 0019_support_session_scope.sql — NOT journaled, never run by the migrator.
-- Run by hand as a superuser, then delete the 0019 row from drizzle.__drizzle_migrations.
BEGIN;
ALTER TABLE "audit_log" DROP COLUMN "support_session_id";
ALTER TABLE "platform_audit_log" DROP COLUMN "support_session_id";
ALTER TABLE "support_session" DROP COLUMN "scope";
COMMIT;
