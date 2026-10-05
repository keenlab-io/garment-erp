-- DOWN script for 0017_tenant_purge.sql — NOT journaled, never run by the migrator.
-- Run by hand as a superuser, then delete the 0017 row from drizzle.__drizzle_migrations.
-- Restores the unconditional append-only trigger functions of 0001/0004/0007.
BEGIN;
CREATE OR REPLACE FUNCTION audit_log_no_mutate() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION stock_movement_no_mutate() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'stock_movement is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION production_scan_no_mutate() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'production_scan is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
COMMIT;
