-- M10 public demo §4 (openspec/changes/m10-public-demo, task 4.2, design D6). The sandbox carries
-- the guest's PDPA lead opt-in (`demo_lead_consented_at`, null = no consent — the default) and
-- their Google display name, so the purge can copy `{ email, name, consented_at }` into
-- `demo_lead` iff the guest opted in. Both die with the sandbox's `tenant` row. Column-only on an
-- existing table: erp_app's table-level grants already cover it.
--
-- Companion down script (not journaled): tooling/drizzle-down/0023_demo_lead_consent.down.sql
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "demo_lead_consented_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "demo_guest_name" text;
