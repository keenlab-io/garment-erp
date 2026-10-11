-- M8 tenant control plane §6 (openspec/changes/m8-tenant-control-plane, tasks 6.1/6.2).
-- `support_session.scope` (design D8): FULL acts as the tenant super-admin, READ_ONLY routes every
-- request through the tenant read-only rules; existing M7 sessions were FULL by construction.
-- `support_session_id` on both audit ledgers ties every row written under a support token to its
-- session, so the tenant's own `audit_log` and `platform_audit_log` carry the same trail. Columns
-- on existing tables inherit their grants (no erp_app GRANT needed).
--
-- Companion down script (not journaled): tooling/drizzle-down/0019_support_session_scope.down.sql
ALTER TABLE "support_session" ADD COLUMN "scope" text DEFAULT 'FULL' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_audit_log" ADD COLUMN "support_session_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "support_session_id" uuid;
