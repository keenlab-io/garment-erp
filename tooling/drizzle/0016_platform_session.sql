-- M8 tenant control plane §3 (openspec/changes/m8-tenant-control-plane, tasks 3.1/3.2, design
-- D7). `platform_session` is the control-plane twin of the tenant `session` table: one row per
-- issued platform token pair, keyed by the `sid` claim, so platform logout revokes and
-- `PlatformJwtGuard` can refuse revoked/expired sessions. TENANT_EXEMPT (no `tenant_id`, no RLS)
-- like its `platform_admin` parent — added to the parity allowlists. `erp_app` gets DML on it via
-- 0012's `ALTER DEFAULT PRIVILEGES`. `platform_audit_log.correlation_id` ties each control-plane
-- audit row to the request transaction that wrote it (nullable: pre-existing rows have none).
--
-- Companion down script (not journaled): tooling/drizzle-down/0016_platform_session.down.sql
CREATE TABLE "platform_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_admin_id" uuid NOT NULL,
	"token_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_session_tokenId_unique" UNIQUE("token_id")
);
--> statement-breakpoint
ALTER TABLE "platform_audit_log" ADD COLUMN "correlation_id" uuid;--> statement-breakpoint
ALTER TABLE "platform_session" ADD CONSTRAINT "platform_session_platform_admin_id_platform_admin_id_fk" FOREIGN KEY ("platform_admin_id") REFERENCES "public"."platform_admin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_session_admin_idx" ON "platform_session" USING btree ("platform_admin_id");