-- DOWN script for 0018_control_plane_grants.sql — NOT journaled, never run by the migrator.
-- Revokes the runtime grants (ownership stays with erp_owner — harmless, and the original
-- superuser owner is environment-specific). Run by hand as a superuser, then delete the 0018 row
-- from drizzle.__drizzle_migrations.
BEGIN;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "plan", "tenant_feature", "platform_session" FROM erp_app;
COMMIT;
