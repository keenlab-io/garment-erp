-- DOWN script for 0015_control_plane.sql — NOT journaled, never run by the migrator.
-- Run by hand as a superuser, then delete the 0015 row from drizzle.__drizzle_migrations.
BEGIN;
DROP POLICY IF EXISTS "tenant_isolation" ON "tenant_feature";
ALTER TABLE "tenant_feature" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "tenant_feature" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant" DROP CONSTRAINT IF EXISTS "tenant_plan_id_plan_id_fk";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "extra_seats";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "plan_id";
DROP TABLE IF EXISTS "tenant_feature";
DROP TABLE IF EXISTS "plan";
COMMIT;
