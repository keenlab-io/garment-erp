-- Enforce append-only on stock_movement at the database level via a trigger, so the
-- stock ledger's immutability holds even for the table owner (a plain REVOKE
-- UPDATE/DELETE does not bind the owner in the single-role dev setup). INSERT stays
-- permitted; corrections are new compensating movements, never edits (spec §3.5).
-- Mirrors the audit_log append-only trigger (migration 0001).
CREATE FUNCTION stock_movement_no_mutate() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'stock_movement is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER stock_movement_no_update_delete
	BEFORE UPDATE OR DELETE ON "stock_movement"
	FOR EACH ROW EXECUTE FUNCTION stock_movement_no_mutate();
