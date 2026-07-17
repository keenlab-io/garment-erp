-- Enforce append-only on production_scan at the database level via a trigger, so shop-floor
-- scan history's immutability holds even for the table owner (a plain REVOKE UPDATE/DELETE
-- does not bind the owner in the single-role dev setup). INSERT stays permitted; corrections
-- are new compensating scans, never edits (spec §4.2). Mirrors the audit_log (migration 0001)
-- and stock_movement (migration 0004) append-only triggers.
CREATE FUNCTION production_scan_no_mutate() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'production_scan is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER production_scan_no_update_delete
	BEFORE UPDATE OR DELETE ON "production_scan"
	FOR EACH ROW EXECUTE FUNCTION production_scan_no_mutate();
