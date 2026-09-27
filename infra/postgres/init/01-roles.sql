-- Dev-only Postgres init (runs once, on a fresh `erp-pgdata` volume). Creates the two M7
-- tenancy roles WITH dev passwords so they can log in (design D2): `erp_owner` owns every
-- relation (BYPASSRLS, so the `reporting.refresh_mv` SECURITY DEFINER refresh sees every
-- tenant); `erp_app` is the RLS-bound runtime role the API connects as (`DATABASE_URL`).
-- Migrations 0012/0013 create/alter the same roles idempotently (without passwords) where this
-- script did not run, and move ownership/grants onto them.
--
-- Migrations and the seed run as the bootstrap superuser (`POSTGRES_USER`, via
-- `DATABASE_OWNER_URL`): 0000 creates extensions and 0013 grants BYPASSRLS, both superuser-only.
-- An older volume whose erp_app has no password: `ALTER ROLE erp_app PASSWORD 'erp_app';`.
CREATE ROLE erp_owner LOGIN BYPASSRLS PASSWORD 'erp_owner';
CREATE ROLE erp_app LOGIN NOBYPASSRLS PASSWORD 'erp_app';
