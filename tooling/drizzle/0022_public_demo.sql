-- M10 public demo §2 (openspec/changes/m10-public-demo, tasks 2.2/2.3/2.5, design D5/D6/D8).
-- Adds `auth_identity` (how a user can sign in; TENANT_EXEMPT, no RLS — the demo-pool OIDC callback
-- resolves a Google `sub` across tenants), `demo_lead` (opt-in lead capture, control-plane) and
-- `tenant.allow_self_signup` (fails closed, default false). Renumbered 0022 (drafted as 0015).
-- The backfill gives every existing user a PASSWORD identity (subject = username); the argon2id
-- hash stays on `user.password_hash`. As in 0018/0020, migrations run as the bootstrap superuser,
-- so ownership moves to erp_owner and erp_app gets explicit DML.
--
-- Companion down script (not journaled): tooling/drizzle-down/0022_public_demo.down.sql
CREATE TABLE "auth_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject" "citext" NOT NULL,
	"email" "citext",
	"last_login_at" timestamp with time zone,
	CONSTRAINT "auth_identity_tenant_provider_subject_uq" UNIQUE("tenant_id","provider","subject")
);
--> statement-breakpoint
CREATE TABLE "demo_lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"email" "citext" NOT NULL,
	"name" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "allow_self_signup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_identity" ADD CONSTRAINT "auth_identity_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_identity" ADD CONSTRAINT "auth_identity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "auth_identity" ("tenant_id", "user_id", "provider", "subject", "email")
SELECT "tenant_id", "id", 'PASSWORD', "username", "email" FROM "user"
ON CONFLICT ("tenant_id", "provider", "subject") DO NOTHING;--> statement-breakpoint
ALTER TABLE "auth_identity" OWNER TO erp_owner;--> statement-breakpoint
ALTER TABLE "demo_lead" OWNER TO erp_owner;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth_identity", "demo_lead" TO erp_app;
