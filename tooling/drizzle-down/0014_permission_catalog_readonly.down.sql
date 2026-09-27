-- DOWN script for 0014_permission_catalog_readonly.sql — NOT journaled, never run by the migrator.
-- Restores 0012's read-write grant on the global permission catalog. Run by hand as a superuser,
-- then delete the 0014 row from drizzle.__drizzle_migrations.
BEGIN;
GRANT INSERT, UPDATE, DELETE ON "permission" TO erp_app;
COMMIT;
