-- M7 tenancy: the permission catalog is read-only to the runtime (openspec/changes/m7-tenancy-core,
-- task 8.2, design D16). `permission` is tenant-exempt — one global mirror of PERMISSION_CODES
-- shared by every tenant — so it carries no RLS policy, and 0012's blanket
-- `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES … TO erp_app` would otherwise let one
-- tenant's request rewrite the catalog every tenant resolves against. Only the owner-run seed
-- (`DATABASE_OWNER_URL`) writes it; tenants grant catalog codes through their own
-- `role_permission` rows. No schema change — meta/0014_snapshot.json is 0013's, re-chained.
--
-- Companion down script (not journaled): tooling/drizzle-down/0014_permission_catalog_readonly.down.sql
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "permission" FROM erp_app;
