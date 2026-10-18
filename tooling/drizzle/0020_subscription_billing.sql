-- M9 subscription billing §2 (openspec/changes/m9-subscription-billing, tasks 2.1/2.2, design
-- D2/D7). Adds the two control-plane billing tables — `subscription` and `subscription_invoice` —
-- plus list-price range columns on `plan`. Both tables are TENANT_EXEMPT (no `tenant_id` scope, no
-- RLS): `tenant_id` is a plain FK target, and the dunning sweep reads across tenants. Renumbered
-- 0020 (the change was drafted as 0014 before M7/M8 landed). `subscription_invoice_seq` backs the
-- `SINV-{YYYY}-{seq}` vendor invoice number — a dedicated control-plane sequence, not the tenant
-- `document_sequence`. Migrations run as the bootstrap superuser, so (as in 0018) ownership moves
-- to erp_owner and erp_app gets explicit DML + sequence USAGE.
--
-- Companion down script (not journaled): tooling/drizzle-down/0020_subscription_billing.down.sql
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"annual_fee" numeric(18, 4) NOT NULL,
	"term_start" timestamp with time zone NOT NULL,
	"term_end" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"dunning_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"number" text NOT NULL,
	"subscription_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" numeric(18, 4) NOT NULL,
	"total" numeric(18, 4) NOT NULL,
	"status" text DEFAULT 'ISSUED' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"paid_method" text,
	"paid_reference" text,
	"paid_amount" numeric(18, 4),
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "subscription_invoice_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "annual_fee_min" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "annual_fee_max" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "setup_fee_min" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "setup_fee_max" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_invoice" ADD CONSTRAINT "subscription_invoice_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_invoice" ADD CONSTRAINT "subscription_invoice_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_tenant_active_uq" ON "subscription" USING btree ("tenant_id") WHERE "subscription"."status" <> 'CANCELLED' AND "subscription"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "subscription_invoice_subscription_idx" ON "subscription_invoice" USING btree ("subscription_id");--> statement-breakpoint
CREATE SEQUENCE "subscription_invoice_seq" AS bigint START WITH 1 INCREMENT BY 1;--> statement-breakpoint
ALTER TABLE "subscription" OWNER TO erp_owner;--> statement-breakpoint
ALTER TABLE "subscription_invoice" OWNER TO erp_owner;--> statement-breakpoint
ALTER SEQUENCE "subscription_invoice_seq" OWNER TO erp_owner;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "subscription", "subscription_invoice" TO erp_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "subscription_invoice_seq" TO erp_app;
