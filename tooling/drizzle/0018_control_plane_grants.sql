-- M8 tenant control plane §5 (openspec/changes/m8-tenant-control-plane, task 5.1). Brings the
-- tables 0015/0016 created — `plan`, `tenant_feature`, `platform_session` — under 0012's role
-- model. Every environment migrates as the bootstrap superuser (`DATABASE_OWNER_URL`), not as
-- erp_owner, so 0012's `ALTER DEFAULT PRIVILEGES FOR ROLE erp_owner` never fired for them: they
-- were owned by the superuser with no grant to the runtime role, and the first runtime read
-- (`EntitlementsService` resolving `plan.features` + `tenant_feature` for `GET /auth/me`) failed
-- with "permission denied". Ownership moves to erp_owner (FORCE RLS on `tenant_feature` still
-- binds it) and erp_app gets the same DML every other runtime table has.
--
-- Companion down script (not journaled): tooling/drizzle-down/0018_control_plane_grants.down.sql
ALTER TABLE "plan" OWNER TO erp_owner;--> statement-breakpoint
ALTER TABLE "tenant_feature" OWNER TO erp_owner;--> statement-breakpoint
ALTER TABLE "platform_session" OWNER TO erp_owner;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "plan", "tenant_feature", "platform_session" TO erp_app;
