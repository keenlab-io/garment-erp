-- M7 tenancy, part 2: row-level security (openspec/changes/m7-tenancy-core, task 7.9, design
-- D1/D2/D17). Hand-authored on top of drizzle-kit's column-default diff; meta/0013_snapshot.json
-- is drizzle-kit's snapshot, so `pnpm db:generate` yields an empty diff afterwards (the drizzle
-- definitions declare no policies, so drizzle-kit never tries to drop these).
--
-- 0012 converted the schema but left RLS off and gave every `tenant_id` a transitional default
-- that fell back to the default tenant. Now that UnitOfWork sets `app.tenant_id` on every
-- transaction (HTTP requests, auth lookups, jobs via withTenantJob, sweeps fanned out per
-- tenant), this migration restores the fail-closed design:
--
--   §1 every `tenant_id` default reads the GUC only — no tenant in scope → NULL → NOT NULL fails;
--   §2 erp_owner gets BYPASSRLS, so `reporting.refresh_mv` (SECURITY DEFINER, owned by
--      erp_owner) and the owner-run migrations/seed still see every tenant's rows under FORCE;
--   §3 ENABLE + FORCE ROW LEVEL SECURITY and a `tenant_isolation` policy (USING + WITH CHECK)
--      on every non-exempt table (the 60 tables that spread `tenantColumn`).
--
-- `nullif(…, '')` everywhere: a GUC that an earlier transaction on the same pooled connection
-- set reads back as '' (not NULL) once that transaction ends; it must fail closed the same way
-- (no rows, no writes) rather than raise a uuid cast error. Same expression as the 0012 views.
--
-- Exempt (no policy; TENANT_EXEMPT in apps/api/src/tenancy.parity.spec.ts): tenant,
-- tenant_domain, platform_admin, platform_audit_log, support_session, permission.
-- Superusers bypass RLS even under FORCE — the runtime role must be erp_app (NOBYPASSRLS).
--
-- Companion down script (not journaled): tooling/drizzle-down/0013_tenancy_rls.down.sql

-- §1 Fail-closed tenant defaults (drops the 0012 COALESCE fallback).
ALTER TABLE "user" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "document_sequence" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "idempotency_key" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "role" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "role_permission" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "user_role" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "role_template" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "item" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "sku" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "uom" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "uom_conversion" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "warehouse" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "stock_balance" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "stock_lot" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "stock_movement" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "goods_issue" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "goods_issue_line" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "goods_receipt" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "bom" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "bom_line" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "stock_adjustment" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "stock_adjustment_line" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "stock_count" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "stock_count_line" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "department" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "position" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "employee" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "employee_document" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "reporting_line" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "employee_pay_component" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "pay_component" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "salary_record" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "attendance" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "ot_request" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "cash_advance" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "payroll_run" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "payslip" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "advance_policy" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "ot_rate" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "sso_config" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "tax_bracket" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "routing_step" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "routing_template" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "work_order" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "work_order_step" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "defect" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "production_scan" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "subcontract" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "quotation" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "invoice" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "doc_line" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "payment" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "receipt_tax_invoice" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "wht_certificate" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "document_template" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "report_schedule" ALTER COLUMN "tenant_id" SET DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint

-- §2 The owner role reads across tenants: refresh_mv runs as erp_owner and must materialize
-- every tenant's rows; migrations and the seed run as the owner too. Granting BYPASSRLS needs a
-- superuser — the migrating connection is one in every current environment.
DO $$
BEGIN
	IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'erp_owner') THEN
		ALTER ROLE erp_owner BYPASSRLS;
	END IF;
END
$$;--> statement-breakpoint

-- §3 Row-level security: ENABLE + FORCE (FORCE also binds a misconfigured runtime that connects
-- as the owner) and one `tenant_isolation` policy per table.
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "user" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "session" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit_log" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "document_sequence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_sequence" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "document_sequence" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "idempotency_key" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "idempotency_key" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "idempotency_key" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "role" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "role" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "role_permission" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_permission" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "role_permission" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "user_role" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_role" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "user_role" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "role_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_template" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "role_template" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "item" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "item" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "sku" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sku" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sku" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "uom" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "uom" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "uom" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "uom_conversion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "uom_conversion" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "uom_conversion" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "warehouse" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "warehouse" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "warehouse" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "stock_balance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_balance" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stock_balance" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "stock_lot" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_lot" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stock_lot" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "stock_movement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_movement" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stock_movement" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "goods_issue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goods_issue" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "goods_issue" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "goods_issue_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goods_issue_line" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "goods_issue_line" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "goods_receipt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goods_receipt" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "goods_receipt" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "goods_receipt_line" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "bom" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bom" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "bom" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "bom_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bom_line" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "bom_line" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "stock_adjustment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_adjustment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stock_adjustment" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "stock_adjustment_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_adjustment_line" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stock_adjustment_line" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "stock_count" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_count" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stock_count" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "stock_count_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_count_line" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stock_count_line" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "department" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "department" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "department" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "position" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "position" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "position" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "employee" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employee" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "employee" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "employee_document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employee_document" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "employee_document" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "reporting_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reporting_line" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "reporting_line" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "employee_pay_component" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employee_pay_component" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "employee_pay_component" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "pay_component" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pay_component" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "pay_component" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "salary_record" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "salary_record" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "salary_record" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "attendance" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ot_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ot_request" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ot_request" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "cash_advance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cash_advance" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "cash_advance" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "payroll_run" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payroll_run" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payroll_run" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "payslip" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payslip" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payslip" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "advance_policy" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "advance_policy" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "advance_policy" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ot_rate" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ot_rate" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ot_rate" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "sso_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sso_config" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sso_config" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tax_bracket" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tax_bracket" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tax_bracket" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "routing_step" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "routing_step" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "routing_step" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "routing_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "routing_template" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "routing_template" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "work_order" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_order" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "work_order" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "work_order_step" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_order_step" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "work_order_step" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "defect" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "defect" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "defect" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "production_scan" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "production_scan" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "production_scan" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "subcontract" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subcontract" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "subcontract" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "customer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "customer" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "quotation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quotation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "quotation" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoice" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "doc_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "doc_line" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "doc_line" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "payment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payment" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "receipt_tax_invoice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receipt_tax_invoice" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "receipt_tax_invoice" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "wht_certificate" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wht_certificate" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "wht_certificate" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "document_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_template" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "document_template" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "report_schedule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "report_schedule" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "report_schedule" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
