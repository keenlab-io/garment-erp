-- M8 tenant control plane: DB schema (openspec/changes/m8-tenant-control-plane, task 2.2,
-- design D2/D10). Creates only what M7's 0012_tenancy.sql did not already create — `plan`
-- and `tenant_feature`, plus `tenant.plan_id` / `tenant.extra_seats`. `platform_admin`,
-- `platform_audit_log`, and `support_session` are M7's; this migration does not touch them.
--
-- `plan` is TENANT_EXEMPT (no `tenant_id`, no RLS) — it's a shared catalog, not tenant data;
-- it joins the allowlist in apps/api/src/tenancy.parity.spec.ts. `tenant_feature` is the one
-- control-plane table that IS tenant-scoped: drizzle-kit generated its `tenant_id` with the
-- same fail-closed GUC-only default 0013_tenancy_rls gave every business table (no transitional
-- fallback needed — this table is new, there are no pre-existing rows to backfill), so §1 below
-- only has to add the RLS policy, not repeat the default-tightening 0013 did.
--
-- `tenant.plan_id` is nullable at the column level: the pre-M8 default tenant (inserted by
-- 0012 before any `plan` row exists) has none until the seed backfills it once the plan catalog
-- is seeded (task 2.3). `ProvisioningService` (M8 design D1) always sets it for every tenant it
-- creates from here on — the NOT NULL business rule lives there, not in the schema, precisely
-- because this migration cannot backfill a column that references data it doesn't seed.
--
-- Companion down script (not journaled): tooling/drizzle-down/0015_control_plane.down.sql
CREATE TABLE "plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"code" text NOT NULL,
	"included_seats" integer NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "plan_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tenant_feature" (
	"tenant_id" uuid DEFAULT nullif(current_setting('app.tenant_id', true), '')::uuid NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "tenant_feature_tenant_id_key_pk" PRIMARY KEY("tenant_id","key")
);
--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "extra_seats" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_feature" ADD CONSTRAINT "tenant_feature_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- §1 Row-level security on the one non-exempt control-plane table, same pattern as every
-- business table in 0013_tenancy_rls.sql (ENABLE + FORCE, one `tenant_isolation` policy).
ALTER TABLE "tenant_feature" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_feature" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_feature" USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
