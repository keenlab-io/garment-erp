-- Dev-only Postgres init (runs once, on a fresh `erp-pgdata` volume). Creates the two M7
-- tenancy roles WITH dev passwords so they can log in (design D2): `erp_owner` owns every
-- relation and runs migrations/seed (`DATABASE_OWNER_URL`); `erp_app` is the RLS-bound runtime
-- role. Migration 0012 creates the same roles idempotently (without passwords) where this
-- script did not run, and moves ownership/grants onto them.
--
-- Until task 7.9 (RLS enablement) the API keeps connecting as the bootstrap superuser
-- (`POSTGRES_USER`); switching the runtime DATABASE_URL to erp_app lands with 7.9.
CREATE ROLE erp_owner LOGIN PASSWORD 'erp_owner';
CREATE ROLE erp_app LOGIN NOBYPASSRLS PASSWORD 'erp_app';
