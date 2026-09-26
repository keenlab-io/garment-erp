-- DOWN script for 0012_tenancy.sql — NOT journaled, never run by the migrator (design
-- "Migration Plan → Rollback"). Run by hand, as a superuser, in a maintenance window, only
-- when rolling a database back to the single-tenant schema. Data from any tenant other than
-- the default one is DISCARDED (tenant columns are dropped, so rows of other tenants would
-- collide on the restored global uniques — delete them first). Roles erp_owner/erp_app are
-- cluster-wide and left in place; drop them manually if no other database uses them.
BEGIN;

-- §5 reporting: wrappers, refresh function, tenant-aware MVs.
DROP FUNCTION IF EXISTS "reporting"."refresh_mv"(text);
DROP SCHEMA IF EXISTS "reporting";
DROP VIEW IF EXISTS "v_stock_valuation", "v_sales_daily", "v_cogs_monthly";
DROP MATERIALIZED VIEW IF EXISTS "mv_stock_valuation", "mv_sales_daily", "mv_cogs_monthly";

-- §3/§4 drop tenant_id everywhere (drops the tenant FKs and the composite uniques/PKs with it).
ALTER TABLE "user" DROP COLUMN "tenant_id";
ALTER TABLE "session" DROP COLUMN "tenant_id";
ALTER TABLE "audit_log" DROP COLUMN "tenant_id";
ALTER TABLE "document_sequence" DROP COLUMN "tenant_id";
ALTER TABLE "idempotency_key" DROP COLUMN "tenant_id";
ALTER TABLE "role" DROP COLUMN "tenant_id";
ALTER TABLE "role_permission" DROP COLUMN "tenant_id";
ALTER TABLE "user_role" DROP COLUMN "tenant_id";
ALTER TABLE "role_template" DROP COLUMN "tenant_id";
ALTER TABLE "item" DROP COLUMN "tenant_id";
ALTER TABLE "sku" DROP COLUMN "tenant_id";
ALTER TABLE "uom" DROP COLUMN "tenant_id";
ALTER TABLE "uom_conversion" DROP COLUMN "tenant_id";
ALTER TABLE "warehouse" DROP COLUMN "tenant_id";
ALTER TABLE "stock_balance" DROP COLUMN "tenant_id";
ALTER TABLE "stock_lot" DROP COLUMN "tenant_id";
ALTER TABLE "stock_movement" DROP COLUMN "tenant_id";
ALTER TABLE "goods_issue" DROP COLUMN "tenant_id";
ALTER TABLE "goods_issue_line" DROP COLUMN "tenant_id";
ALTER TABLE "goods_receipt" DROP COLUMN "tenant_id";
ALTER TABLE "goods_receipt_line" DROP COLUMN "tenant_id";
ALTER TABLE "bom" DROP COLUMN "tenant_id";
ALTER TABLE "bom_line" DROP COLUMN "tenant_id";
ALTER TABLE "stock_adjustment" DROP COLUMN "tenant_id";
ALTER TABLE "stock_adjustment_line" DROP COLUMN "tenant_id";
ALTER TABLE "stock_count" DROP COLUMN "tenant_id";
ALTER TABLE "stock_count_line" DROP COLUMN "tenant_id";
ALTER TABLE "department" DROP COLUMN "tenant_id";
ALTER TABLE "position" DROP COLUMN "tenant_id";
ALTER TABLE "employee" DROP COLUMN "tenant_id";
ALTER TABLE "employee_document" DROP COLUMN "tenant_id";
ALTER TABLE "reporting_line" DROP COLUMN "tenant_id";
ALTER TABLE "employee_pay_component" DROP COLUMN "tenant_id";
ALTER TABLE "pay_component" DROP COLUMN "tenant_id";
ALTER TABLE "salary_record" DROP COLUMN "tenant_id";
ALTER TABLE "attendance" DROP COLUMN "tenant_id";
ALTER TABLE "ot_request" DROP COLUMN "tenant_id";
ALTER TABLE "cash_advance" DROP COLUMN "tenant_id";
ALTER TABLE "payroll_run" DROP COLUMN "tenant_id";
ALTER TABLE "payslip" DROP COLUMN "tenant_id";
ALTER TABLE "advance_policy" DROP COLUMN "tenant_id";
ALTER TABLE "ot_rate" DROP COLUMN "tenant_id";
ALTER TABLE "sso_config" DROP COLUMN "tenant_id";
ALTER TABLE "tax_bracket" DROP COLUMN "tenant_id";
ALTER TABLE "routing_step" DROP COLUMN "tenant_id";
ALTER TABLE "routing_template" DROP COLUMN "tenant_id";
ALTER TABLE "work_order" DROP COLUMN "tenant_id";
ALTER TABLE "work_order_step" DROP COLUMN "tenant_id";
ALTER TABLE "defect" DROP COLUMN "tenant_id";
ALTER TABLE "production_scan" DROP COLUMN "tenant_id";
ALTER TABLE "subcontract" DROP COLUMN "tenant_id";
ALTER TABLE "customer" DROP COLUMN "tenant_id";
ALTER TABLE "quotation" DROP COLUMN "tenant_id";
ALTER TABLE "invoice" DROP COLUMN "tenant_id";
ALTER TABLE "doc_line" DROP COLUMN "tenant_id";
ALTER TABLE "payment" DROP COLUMN "tenant_id";
ALTER TABLE "receipt_tax_invoice" DROP COLUMN "tenant_id";
ALTER TABLE "wht_certificate" DROP COLUMN "tenant_id";
ALTER TABLE "document_template" DROP COLUMN "tenant_id";
ALTER TABLE "report_schedule" DROP COLUMN "tenant_id";

-- §4 restore the original global constraints.
ALTER TABLE "document_sequence" ADD CONSTRAINT "document_sequence_pkey" PRIMARY KEY ("key");
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_key_user_id_pk" PRIMARY KEY ("key","user_id");
ALTER TABLE "user" ADD CONSTRAINT "user_username_unique" UNIQUE("username");
ALTER TABLE "user" ADD CONSTRAINT "user_email_unique" UNIQUE("email");
ALTER TABLE "document_sequence" ADD CONSTRAINT "document_sequence_key_year_scope_uq" UNIQUE("key","year_scope");
ALTER TABLE "role" ADD CONSTRAINT "role_name_unique" UNIQUE("name");
ALTER TABLE "role_template" ADD CONSTRAINT "role_template_name_unique" UNIQUE("name");
ALTER TABLE "item" ADD CONSTRAINT "item_code_unique" UNIQUE("code");
ALTER TABLE "sku" ADD CONSTRAINT "sku_skuCode_unique" UNIQUE("sku_code");
ALTER TABLE "sku" ADD CONSTRAINT "sku_barcode_unique" UNIQUE("barcode");
ALTER TABLE "uom" ADD CONSTRAINT "uom_code_unique" UNIQUE("code");
ALTER TABLE "stock_lot" ADD CONSTRAINT "stock_lot_barcode_unique" UNIQUE("barcode");
ALTER TABLE "goods_issue" ADD CONSTRAINT "goods_issue_docNo_unique" UNIQUE("doc_no");
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_docNo_unique" UNIQUE("doc_no");
ALTER TABLE "employee" ADD CONSTRAINT "employee_empCode_unique" UNIQUE("emp_code");
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_period_unique" UNIQUE("period");
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_woNo_unique" UNIQUE("wo_no");
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_docNo_unique" UNIQUE("doc_no");
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_docNo_unique" UNIQUE("doc_no");
ALTER TABLE "receipt_tax_invoice" ADD CONSTRAINT "receipt_tax_invoice_docNo_unique" UNIQUE("doc_no");
ALTER TABLE "wht_certificate" ADD CONSTRAINT "wht_certificate_certNo_unique" UNIQUE("cert_no");

-- §1 control-plane tables.
DROP TABLE "platform_audit_log", "support_session", "platform_admin", "tenant_domain", "tenant";
DROP FUNCTION "platform_audit_log_no_mutate"();

-- Restore the M6 materialized views exactly as 0011 created them.
CREATE MATERIALIZED VIEW "mv_stock_valuation" AS
SELECT
	"item_id",
	"warehouse_id",
	"qty_on_hand",
	"avg_cost",
	"qty_on_hand" * "avg_cost" AS "value"
FROM "stock_balance";
CREATE UNIQUE INDEX "mv_stock_valuation_item_id_warehouse_id_index" ON "mv_stock_valuation" USING btree ("item_id","warehouse_id");

CREATE MATERIALIZED VIEW "mv_sales_daily" AS
SELECT
	"issue_date"::date AS "d",
	"customer_id",
	sum("subtotal") AS "sales",
	sum("vat_amount") AS "vat"
FROM "invoice"
WHERE "status" <> 'VOID'
GROUP BY 1, 2;
CREATE UNIQUE INDEX "mv_sales_daily_d_customer_id_index" ON "mv_sales_daily" USING btree ("d","customer_id");

CREATE MATERIALIZED VIEW "mv_cogs_monthly" AS
SELECT
	date_trunc('month', "at") AS "m",
	sum("qty" * "unit_cost") AS "cogs"
FROM "stock_movement"
WHERE "direction" = 'OUT' AND "ref_type" IN ('GOODS_ISSUE', 'BACKFLUSH')
GROUP BY 1;
CREATE UNIQUE INDEX "mv_cogs_monthly_m_index" ON "mv_cogs_monthly" USING btree ("m");

-- Return ownership to the migrating role and drop the runtime grants.
REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM erp_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM erp_app;
REVOKE USAGE ON SCHEMA "public" FROM erp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE erp_owner IN SCHEMA "public" REVOKE ALL ON TABLES FROM erp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE erp_owner IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM erp_app;
REASSIGN OWNED BY erp_owner TO CURRENT_USER;

-- Forget the migration so a later `db:migrate` would re-apply it.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "created_at" = (SELECT max("created_at") FROM "drizzle"."__drizzle_migrations");

COMMIT;
