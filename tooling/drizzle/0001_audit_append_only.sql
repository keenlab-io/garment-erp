-- Enforce append-only on audit_log at the database level via a trigger, so
-- immutability holds even for the table owner (a plain REVOKE UPDATE/DELETE does
-- not bind the owner in the single-role dev setup). INSERT stays permitted.
-- M0 audit-log capability spec; plan §3 (✔ verified rejects UPDATE/DELETE).
CREATE FUNCTION audit_log_no_mutate() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
	BEFORE UPDATE OR DELETE ON "audit_log"
	FOR EACH ROW EXECUTE FUNCTION audit_log_no_mutate();
