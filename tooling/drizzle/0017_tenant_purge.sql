-- M8 tenant control plane §4 (openspec/changes/m8-tenant-control-plane, task 4.3, design D9).
-- `tenant.purge` must remove a tenant's rows from the three append-only tables (audit_log,
-- stock_movement, production_scan), whose triggers (0001/0004/0007) refuse every UPDATE/DELETE.
-- Replace their trigger functions with one narrow exception: a DELETE is permitted only when
--   1. the row's tenant is in status PURGING (reachable only via the platform purge endpoint,
--      which requires SUSPENDED + a typed confirmation), and
--   2. the transaction has opted in with `set_config('app.purge_tenant_id', <tid>, true)`
--      naming that same tenant (only the purge worker does).
-- UPDATE stays refused unconditionally; so does every DELETE for an ACTIVE/READ_ONLY/SUSPENDED
-- tenant. platform_audit_log is untouched — it outlives the tenant by design.
--
-- Companion down script (not journaled): tooling/drizzle-down/0017_tenant_purge.down.sql
CREATE OR REPLACE FUNCTION audit_log_no_mutate() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE'
		AND OLD.tenant_id::text = current_setting('app.purge_tenant_id', true)
		AND EXISTS (SELECT 1 FROM tenant WHERE id = OLD.tenant_id AND status = 'PURGING')
	THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE FUNCTION stock_movement_no_mutate() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE'
		AND OLD.tenant_id::text = current_setting('app.purge_tenant_id', true)
		AND EXISTS (SELECT 1 FROM tenant WHERE id = OLD.tenant_id AND status = 'PURGING')
	THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'stock_movement is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE FUNCTION production_scan_no_mutate() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE'
		AND OLD.tenant_id::text = current_setting('app.purge_tenant_id', true)
		AND EXISTS (SELECT 1 FROM tenant WHERE id = OLD.tenant_id AND status = 'PURGING')
	THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'production_scan is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
