-- M7 tenancy (openspec/changes/m7-tenancy-core, design D14/D17). Hand-authored: drizzle-kit
-- cannot express the backfill, the MV rebuild + security-barrier views, the SECURITY DEFINER
-- refresh function, or the roles/grants. The drizzle definitions in packages/db/src agree with
-- this file (meta/0012_snapshot.json), so `pnpm db:generate` yields an empty diff afterwards.
--
-- Default tenant id 00000000-0000-4000-8000-000000000001 is `DEFAULT_TENANT_ID` in packages/db/src/base-columns.ts.
--
-- TRANSITIONAL (design D17): row-level security is NOT enabled here, and the `tenant_id` column
-- default falls back to the default tenant when the `app.tenant_id` GUC is unset. Task 7.9's
-- follow-up migration enables + FORCEs RLS (`tenant_isolation` policies) and drops the fallback
-- (fail-closed default `current_setting('app.tenant_id', true)::uuid`) once the tenancy module
-- sets the GUC on every transaction.
--
-- Companion down script (not journaled): tooling/drizzle-down/0012_tenancy.down.sql

-- §1 Control-plane tables (tenant-exempt: these rows ARE the tenants / the platform).
CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"slug" "citext" NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tenant_slug_unique" UNIQUE("slug")
);--> statement-breakpoint
CREATE TABLE "tenant_domain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"hostname" "citext" NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resolution_mode" text DEFAULT 'TENANT' NOT NULL,
	CONSTRAINT "tenant_domain_hostname_unique" UNIQUE("hostname")
);--> statement-breakpoint
CREATE TABLE "platform_admin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"email" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "platform_admin_email_unique" UNIQUE("email")
);--> statement-breakpoint
CREATE TABLE "support_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_admin_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"token_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "platform_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"platform_admin_id" uuid,
	"tenant_id" uuid,
	"actor_user_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip" "inet",
	"user_agent" text
);--> statement-breakpoint
ALTER TABLE "tenant_domain" ADD CONSTRAINT "tenant_domain_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_session" ADD CONSTRAINT "support_session_platform_admin_id_platform_admin_id_fk" FOREIGN KEY ("platform_admin_id") REFERENCES "public"."platform_admin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_session" ADD CONSTRAINT "support_session_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_platform_admin_id_platform_admin_id_fk" FOREIGN KEY ("platform_admin_id") REFERENCES "public"."platform_admin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_session_tenant_idx" ON "support_session" USING btree ("tenant_id");--> statement-breakpoint
-- platform_audit_log is append-only, like audit_log (pattern: 0001_audit_append_only.sql).
CREATE FUNCTION platform_audit_log_no_mutate() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'platform_audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER platform_audit_log_no_update_delete
	BEFORE UPDATE OR DELETE ON "platform_audit_log"
	FOR EACH ROW EXECUTE FUNCTION platform_audit_log_no_mutate();--> statement-breakpoint

-- §2 The default tenant every pre-tenancy row is backfilled into (deterministic id).
INSERT INTO "tenant" ("id", "slug", "name", "kind", "status")
VALUES ('00000000-0000-4000-8000-000000000001', 'default', 'default', 'CUSTOMER', 'ACTIVE')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

-- §3 tenant_id on every business table. ADD COLUMN with a CONSTANT default backfills existing
-- rows as metadata only (no table rewrite, no UPDATE — so the append-only triggers on audit_log,
-- stock_movement and production_scan are never tripped), and NOT NULL holds from the start. The
-- constant is then swapped for the GUC-driven default (with the transitional fallback).
-- user
ALTER TABLE "user" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- session
ALTER TABLE "session" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- audit_log
ALTER TABLE "audit_log" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- document_sequence
ALTER TABLE "document_sequence" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "document_sequence" ADD CONSTRAINT "document_sequence_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sequence" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- idempotency_key
ALTER TABLE "idempotency_key" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_key" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- role
ALTER TABLE "role" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- role_permission
ALTER TABLE "role_permission" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- user_role
ALTER TABLE "user_role" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- role_template
ALTER TABLE "role_template" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "role_template" ADD CONSTRAINT "role_template_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_template" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- item
ALTER TABLE "item" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- sku
ALTER TABLE "sku" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "sku" ADD CONSTRAINT "sku_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- uom
ALTER TABLE "uom" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "uom" ADD CONSTRAINT "uom_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uom" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- uom_conversion
ALTER TABLE "uom_conversion" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "uom_conversion" ADD CONSTRAINT "uom_conversion_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uom_conversion" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- warehouse
ALTER TABLE "warehouse" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse" ADD CONSTRAINT "warehouse_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- stock_balance
ALTER TABLE "stock_balance" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balance" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- stock_lot
ALTER TABLE "stock_lot" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_lot" ADD CONSTRAINT "stock_lot_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lot" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- stock_movement
ALTER TABLE "stock_movement" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- goods_issue
ALTER TABLE "goods_issue" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_issue" ADD CONSTRAINT "goods_issue_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_issue" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- goods_issue_line
ALTER TABLE "goods_issue_line" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_issue_line" ADD CONSTRAINT "goods_issue_line_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_issue_line" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- goods_receipt
ALTER TABLE "goods_receipt" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- goods_receipt_line
ALTER TABLE "goods_receipt_line" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_line" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- bom
ALTER TABLE "bom" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "bom" ADD CONSTRAINT "bom_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- bom_line
ALTER TABLE "bom_line" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_line" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- stock_adjustment
ALTER TABLE "stock_adjustment" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_adjustment" ADD CONSTRAINT "stock_adjustment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- stock_adjustment_line
ALTER TABLE "stock_adjustment_line" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_adjustment_line" ADD CONSTRAINT "stock_adjustment_line_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_line" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- stock_count
ALTER TABLE "stock_count" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- stock_count_line
ALTER TABLE "stock_count_line" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_line" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- department
ALTER TABLE "department" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- position
ALTER TABLE "position" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "position" ADD CONSTRAINT "position_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- employee
ALTER TABLE "employee" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- employee_document
ALTER TABLE "employee_document" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_document" ADD CONSTRAINT "employee_document_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- reporting_line
ALTER TABLE "reporting_line" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "reporting_line" ADD CONSTRAINT "reporting_line_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_line" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- employee_pay_component
ALTER TABLE "employee_pay_component" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_pay_component" ADD CONSTRAINT "employee_pay_component_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_pay_component" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- pay_component
ALTER TABLE "pay_component" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "pay_component" ADD CONSTRAINT "pay_component_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_component" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- salary_record
ALTER TABLE "salary_record" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_record" ADD CONSTRAINT "salary_record_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_record" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- attendance
ALTER TABLE "attendance" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- ot_request
ALTER TABLE "ot_request" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ot_request" ADD CONSTRAINT "ot_request_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ot_request" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- cash_advance
ALTER TABLE "cash_advance" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_advance" ADD CONSTRAINT "cash_advance_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_advance" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- payroll_run
ALTER TABLE "payroll_run" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- payslip
ALTER TABLE "payslip" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- advance_policy
ALTER TABLE "advance_policy" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "advance_policy" ADD CONSTRAINT "advance_policy_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_policy" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- ot_rate
ALTER TABLE "ot_rate" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ot_rate" ADD CONSTRAINT "ot_rate_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ot_rate" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- sso_config
ALTER TABLE "sso_config" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "sso_config" ADD CONSTRAINT "sso_config_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_config" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- tax_bracket
ALTER TABLE "tax_bracket" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_bracket" ADD CONSTRAINT "tax_bracket_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_bracket" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- routing_step
ALTER TABLE "routing_step" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "routing_step" ADD CONSTRAINT "routing_step_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_step" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- routing_template
ALTER TABLE "routing_template" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "routing_template" ADD CONSTRAINT "routing_template_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_template" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- work_order
ALTER TABLE "work_order" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- work_order_step
ALTER TABLE "work_order_step" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "work_order_step" ADD CONSTRAINT "work_order_step_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_step" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- defect
ALTER TABLE "defect" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "defect" ADD CONSTRAINT "defect_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defect" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- production_scan
ALTER TABLE "production_scan" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "production_scan" ADD CONSTRAINT "production_scan_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_scan" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- subcontract
ALTER TABLE "subcontract" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "subcontract" ADD CONSTRAINT "subcontract_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontract" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- customer
ALTER TABLE "customer" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- quotation
ALTER TABLE "quotation" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- invoice
ALTER TABLE "invoice" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- doc_line
ALTER TABLE "doc_line" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "doc_line" ADD CONSTRAINT "doc_line_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_line" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- payment
ALTER TABLE "payment" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- receipt_tax_invoice
ALTER TABLE "receipt_tax_invoice" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "receipt_tax_invoice" ADD CONSTRAINT "receipt_tax_invoice_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_tax_invoice" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- wht_certificate
ALTER TABLE "wht_certificate" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "wht_certificate" ADD CONSTRAINT "wht_certificate_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wht_certificate" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- document_template
ALTER TABLE "document_template" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "document_template" ADD CONSTRAINT "document_template_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_template" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint
-- report_schedule
ALTER TABLE "report_schedule" ADD COLUMN "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "report_schedule" ADD CONSTRAINT "report_schedule_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedule" ALTER COLUMN "tenant_id" SET DEFAULT coalesce(nullif(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-4000-8000-000000000001'::uuid);--> statement-breakpoint

-- §4 Constraint swaps: global natural-key uniques/PKs become per-tenant composites. The
-- composite uniques lead with tenant_id, so they double as the tenant-leading indexes for the
-- natural-key lookups (doc numbers, codes, usernames).
ALTER TABLE "user" DROP CONSTRAINT "user_username_unique";--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_email_unique";--> statement-breakpoint
ALTER TABLE "document_sequence" DROP CONSTRAINT "document_sequence_key_year_scope_uq";--> statement-breakpoint
ALTER TABLE "role" DROP CONSTRAINT "role_name_unique";--> statement-breakpoint
ALTER TABLE "role_template" DROP CONSTRAINT "role_template_name_unique";--> statement-breakpoint
ALTER TABLE "item" DROP CONSTRAINT "item_code_unique";--> statement-breakpoint
ALTER TABLE "sku" DROP CONSTRAINT "sku_skuCode_unique";--> statement-breakpoint
ALTER TABLE "sku" DROP CONSTRAINT "sku_barcode_unique";--> statement-breakpoint
ALTER TABLE "uom" DROP CONSTRAINT "uom_code_unique";--> statement-breakpoint
ALTER TABLE "stock_lot" DROP CONSTRAINT "stock_lot_barcode_unique";--> statement-breakpoint
ALTER TABLE "goods_issue" DROP CONSTRAINT "goods_issue_docNo_unique";--> statement-breakpoint
ALTER TABLE "goods_receipt" DROP CONSTRAINT "goods_receipt_docNo_unique";--> statement-breakpoint
ALTER TABLE "employee" DROP CONSTRAINT "employee_empCode_unique";--> statement-breakpoint
ALTER TABLE "payroll_run" DROP CONSTRAINT "payroll_run_period_unique";--> statement-breakpoint
ALTER TABLE "work_order" DROP CONSTRAINT "work_order_woNo_unique";--> statement-breakpoint
ALTER TABLE "quotation" DROP CONSTRAINT "quotation_docNo_unique";--> statement-breakpoint
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_docNo_unique";--> statement-breakpoint
ALTER TABLE "receipt_tax_invoice" DROP CONSTRAINT "receipt_tax_invoice_docNo_unique";--> statement-breakpoint
ALTER TABLE "wht_certificate" DROP CONSTRAINT "wht_certificate_certNo_unique";--> statement-breakpoint
ALTER TABLE "idempotency_key" DROP CONSTRAINT "idempotency_key_key_user_id_pk";--> statement-breakpoint
ALTER TABLE "document_sequence" DROP CONSTRAINT "document_sequence_pkey";--> statement-breakpoint
ALTER TABLE "document_sequence" ADD CONSTRAINT "document_sequence_tenant_id_key_pk" PRIMARY KEY("tenant_id","key");--> statement-breakpoint
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_tenant_id_key_user_id_pk" PRIMARY KEY("tenant_id","key","user_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_tenant_username_uq" UNIQUE("tenant_id","username");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_tenant_email_uq" UNIQUE("tenant_id","email");--> statement-breakpoint
ALTER TABLE "document_sequence" ADD CONSTRAINT "document_sequence_tenant_key_year_scope_uq" UNIQUE("tenant_id","key","year_scope");--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_tenant_name_uq" UNIQUE("tenant_id","name");--> statement-breakpoint
ALTER TABLE "role_template" ADD CONSTRAINT "role_template_tenant_name_uq" UNIQUE("tenant_id","name");--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_tenant_code_uq" UNIQUE("tenant_id","code");--> statement-breakpoint
ALTER TABLE "sku" ADD CONSTRAINT "sku_tenant_sku_code_uq" UNIQUE("tenant_id","sku_code");--> statement-breakpoint
ALTER TABLE "sku" ADD CONSTRAINT "sku_tenant_barcode_uq" UNIQUE("tenant_id","barcode");--> statement-breakpoint
ALTER TABLE "uom" ADD CONSTRAINT "uom_tenant_code_uq" UNIQUE("tenant_id","code");--> statement-breakpoint
ALTER TABLE "stock_lot" ADD CONSTRAINT "stock_lot_tenant_barcode_uq" UNIQUE("tenant_id","barcode");--> statement-breakpoint
ALTER TABLE "goods_issue" ADD CONSTRAINT "goods_issue_tenant_doc_no_uq" UNIQUE("tenant_id","doc_no");--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_tenant_doc_no_uq" UNIQUE("tenant_id","doc_no");--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_tenant_emp_code_uq" UNIQUE("tenant_id","emp_code");--> statement-breakpoint
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_tenant_period_uq" UNIQUE("tenant_id","period");--> statement-breakpoint
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenant_wo_no_uq" UNIQUE("tenant_id","wo_no");--> statement-breakpoint
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_tenant_doc_no_uq" UNIQUE("tenant_id","doc_no");--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_tenant_doc_no_uq" UNIQUE("tenant_id","doc_no");--> statement-breakpoint
ALTER TABLE "receipt_tax_invoice" ADD CONSTRAINT "receipt_tax_invoice_tenant_doc_no_uq" UNIQUE("tenant_id","doc_no");--> statement-breakpoint
ALTER TABLE "wht_certificate" ADD CONSTRAINT "wht_certificate_tenant_cert_no_uq" UNIQUE("tenant_id","cert_no");--> statement-breakpoint

-- §5 Reporting MVs carry tenant_id (in the SELECT and in each UNIQUE index, so REFRESH …
-- CONCURRENTLY still works). RLS cannot apply to a materialized view, so tenant reads go through
-- the security_barrier `v_*` wrappers (repositories switch to them in task 7.7). An unset/reset
-- GUC reads NULL/'' → no rows (fail-closed).
DROP MATERIALIZED VIEW "mv_stock_valuation";--> statement-breakpoint
DROP MATERIALIZED VIEW "mv_sales_daily";--> statement-breakpoint
DROP MATERIALIZED VIEW "mv_cogs_monthly";--> statement-breakpoint
CREATE MATERIALIZED VIEW "mv_stock_valuation" AS
SELECT
	"tenant_id",
	"item_id",
	"warehouse_id",
	"qty_on_hand",
	"avg_cost",
	"qty_on_hand" * "avg_cost" AS "value"
FROM "stock_balance";--> statement-breakpoint
CREATE UNIQUE INDEX "mv_stock_valuation_tenant_id_item_id_warehouse_id_index" ON "mv_stock_valuation" USING btree ("tenant_id","item_id","warehouse_id");--> statement-breakpoint
CREATE MATERIALIZED VIEW "mv_sales_daily" AS
SELECT
	"tenant_id",
	"issue_date"::date AS "d",
	"customer_id",
	sum("subtotal") AS "sales",
	sum("vat_amount") AS "vat"
FROM "invoice"
WHERE "status" <> 'VOID'
GROUP BY 1, 2, 3;--> statement-breakpoint
CREATE UNIQUE INDEX "mv_sales_daily_tenant_id_d_customer_id_index" ON "mv_sales_daily" USING btree ("tenant_id","d","customer_id");--> statement-breakpoint
CREATE MATERIALIZED VIEW "mv_cogs_monthly" AS
SELECT
	"tenant_id",
	date_trunc('month', "at") AS "m",
	sum("qty" * "unit_cost") AS "cogs"
FROM "stock_movement"
WHERE "direction" = 'OUT' AND "ref_type" IN ('GOODS_ISSUE', 'BACKFLUSH')
GROUP BY 1, 2;--> statement-breakpoint
CREATE UNIQUE INDEX "mv_cogs_monthly_tenant_id_m_index" ON "mv_cogs_monthly" USING btree ("tenant_id","m");--> statement-breakpoint
CREATE VIEW "v_stock_valuation" WITH (security_barrier) AS
SELECT "tenant_id", "item_id", "warehouse_id", "qty_on_hand", "avg_cost", "value"
FROM "mv_stock_valuation"
WHERE "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
CREATE VIEW "v_sales_daily" WITH (security_barrier) AS
SELECT "tenant_id", "d", "customer_id", "sales", "vat"
FROM "mv_sales_daily"
WHERE "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
CREATE VIEW "v_cogs_monthly" WITH (security_barrier) AS
SELECT "tenant_id", "m", "cogs"
FROM "mv_cogs_monthly"
WHERE "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid;--> statement-breakpoint
-- Owner-rights refresh for the runtime role (REFRESH requires MV ownership). Hard-coded
-- allowlist, no dynamic SQL; ownership moves to erp_owner in §6.
CREATE SCHEMA IF NOT EXISTS "reporting";--> statement-breakpoint
CREATE FUNCTION "reporting"."refresh_mv"(view_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
	IF view_name = 'mv_stock_valuation' THEN
		REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_stock_valuation;
	ELSIF view_name = 'mv_sales_daily' THEN
		REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_sales_daily;
	ELSIF view_name = 'mv_cogs_monthly' THEN
		REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_cogs_monthly;
	ELSE
		RAISE EXCEPTION 'refresh_mv: % is not a refreshable materialized view', view_name;
	END IF;
END;
$$;--> statement-breakpoint

-- §6 Roles (design D2). Idempotent — roles are cluster-wide and may be pre-created (with
-- passwords) by infra/postgres/init or ops. erp_owner owns every relation; erp_app is the
-- RLS-bound runtime role (NOBYPASSRLS, not the owner). The migrating connection (a superuser in
-- every current environment) keeps working unchanged.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_owner') THEN
		CREATE ROLE erp_owner NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
		CREATE ROLE erp_app LOGIN NOBYPASSRLS;
	ELSIF (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'erp_app') THEN
		ALTER ROLE erp_app NOBYPASSRLS;
	END IF;
END
$$;--> statement-breakpoint
DO $$
DECLARE
	r record;
BEGIN
	FOR r IN
		SELECT c.relname, c.relkind
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
	LOOP
		EXECUTE format(
			'ALTER %s %I OWNER TO erp_owner',
			CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,
			r.relname
		);
	END LOOP;
END
$$;--> statement-breakpoint
ALTER SCHEMA "reporting" OWNER TO erp_owner;--> statement-breakpoint
ALTER FUNCTION "reporting"."refresh_mv"(text) OWNER TO erp_owner;--> statement-breakpoint
REVOKE ALL ON FUNCTION "reporting"."refresh_mv"(text) FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA "public", "reporting" TO erp_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO erp_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "public" TO erp_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "reporting"."refresh_mv"(text) TO erp_app;--> statement-breakpoint
-- The runtime reads MVs only through the v_* wrappers; the control-plane audit trail is append-only.
REVOKE ALL ON "mv_stock_valuation", "mv_sales_daily", "mv_cogs_monthly" FROM erp_app;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "platform_audit_log" FROM erp_app;--> statement-breakpoint
-- Relations erp_owner creates later (future migrations run as DATABASE_OWNER_URL) get the same grants.
ALTER DEFAULT PRIVILEGES FOR ROLE erp_owner IN SCHEMA "public" GRANT USAGE, SELECT ON SEQUENCES TO erp_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE erp_owner IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;
