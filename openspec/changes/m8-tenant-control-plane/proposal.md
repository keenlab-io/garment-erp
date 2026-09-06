# M8 — Tenant Control Plane

## Why

M7 (`m7-tenancy-core`) makes the ERP structurally multi-tenant: `tenant_id` + RLS on
every business table, the `tid` claim, `tenantContext`, and hostname resolution. What it
deliberately does **not** deliver is the commercial machinery that makes tenants sellable:
there is no way to provision a paying tenant, no notion of a plan or what it entitles, no
seat counting, no feature flags, no platform operator who can administer tenants without
being *inside* one, and no controlled way for support staff to see what a customer sees.

M8 is that control plane. It exists to implement what
`docs/Garment_ERP_Go_To_Market_Plain_Language.md` sells: four packages (Workshop /
Factory / Multi-site / Self-hosted) with included seat counts (8/20/40/20), **free
scan-only floor accounts** that never count toward the cap (Part 3 — free floor accounts
are how real production data ends up in the system instead of on paper), module gating as
the add-on upsell path, and a vendor operations surface (the `platform_admin` principal)
that can provision, suspend, export, and — under a time-boxed, reason-tagged, fully
audited support session — impersonate. M9 (billing) and M10 (demo) both build on these
primitives: M9 attaches subscriptions and invoices to the plans defined here; M10's
sandbox provisioning reuses this change's provisioning engine with a demo seed.

Scope is proposal-depth backend + a minimal platform console; the full tenant-facing
admin UX (plan/usage screens inside the ERP) is a later change.

## What Changes

- **Tenant provisioning & onboarding**: `provisionTenant` in `apps/api/src/platform/` —
  creates the `tenant` row (kind `CUSTOMER`), its `tenant_domain`, the per-tenant config
  rows M7 made tenant-scoped (`sso_config`, `tax_bracket`, `advance_policy`,
  `document_template`, `report_schedule` — seeded from Thai defaults), the tenant's
  document-sequence scope, and the first **tenant super-admin** user with a temp
  password. Exposed only to platform admins; M10 reuses the same engine for
  `DEMO_SANDBOX` tenants.
- **The `plan` table & entitlements**: `plan.code = WORKSHOP | FACTORY | MULTISITE |
  SELFHOSTED` with `included_seats` (8/20/40/20) and a `features` default map. Module
  access (`hr`, `inventory`, `production`, `sales`, `reporting`) is gated by resolved
  entitlement; a request into an unentitled module fails in-handler next to
  `assertPermissions`. **Multi-site is a pricing tier over the existing `warehouse` /
  `department` dimensions inside ONE tenant — it is NOT a second tenant.**
- **Seat management**: a counted-seat definition (active, non-deleted users whose
  effective permission set is more than shop-floor scanning), a **hard 422**
  (`BusinessRuleError`) on user creation that would exceed `included_seats +
  extra_seats`, and the same check on every operation that can promote an exempt
  scan-only user into a counted one (role assignment, role edit, permission import,
  re-activation).
- **Feature flags**: `tenant_feature (tenant_id, key, enabled)` overriding `plan.features`
  defaults; resolution is tenant row → plan default → off. Platform admins write
  overrides (the add-on/upsell lever and M10's demo-path switchboard); resolved flags are
  delivered to the web app via `GET /auth/me`.
- **The `platform_admin` principal**: a separate table, a separate login surface
  (`/platform/auth/*`), separate JWT claims (no `tid`), argon2id + lockout parity with
  tenant login. Platform admins are **not** users in any tenant and every control-plane
  action they take writes to `platform_audit_log`.
- **Support impersonation**: `support_session` — a platform admin enters a tenant only by
  opening a session with a mandatory reason and scope (`READ_ONLY | FULL`), time-boxed
  (default 60 min, hard cap), producing a tenant-scoped token marked with the session id.
  Every request made under it is audited to **both** `platform_audit_log` and the
  tenant's own `audit_log`, so the customer can see exactly what support did.
- **Tenant lifecycle**: platform-admin transitions across `ACTIVE ↔ READ_ONLY ↔
  SUSPENDED → PURGING`. READ_ONLY has a **precise definition** (reads, exports, payroll
  viewing, and login keep working; business writes are rejected with a distinct error) —
  M9's expiry degradation reuses it verbatim. SUSPENDED refuses login with a clear
  message. Purge is queued, irreversible, and deletes rows in reverse-FK order plus the
  `tenants/{tid}/` S3 prefix.
- **Per-tenant data export (PDPA)**: a queued job that snapshots every business-table row
  and stored object for one tenant into an archive under `tenants/{tid}/exports/`,
  downloadable via presigned URL — triggerable by the tenant super-admin **and** working
  while the tenant is READ_ONLY (a factory mid-payment-dispute can always leave with
  their data).

## Capabilities

### New Capabilities

- `tenant-provisioning`: the provisioning engine (tenant + domain + config seed + first
  super-admin), the tenant lifecycle state machine (`ACTIVE | READ_ONLY | SUSPENDED |
  PURGING`) with the canonical read-only definition, purge, and the PDPA data export.
- `plan-entitlements`: the `plan` table (`WORKSHOP | FACTORY | MULTISITE | SELFHOSTED`),
  module entitlement resolution and in-handler enforcement, and the explicit rule that
  Multi-site is one tenant.
- `seat-management`: the counted-seat definition with the scan-only exemption, the hard
  422 on over-cap user creation, and cap enforcement on every seat-promoting mutation.
- `feature-flags`: `tenant_feature` rows overriding `plan.features` defaults, platform-
  admin override API, and delivery of the resolved set to the web client.
- `platform-admin`: the separate principal, its login surface and token shape, the
  control-plane API (tenant CRUD/lifecycle/export), and `platform_audit_log`.
- `support-impersonation`: `support_session` — reason-tagged, scoped, time-boxed entry
  into a tenant with dual-ledger auditing and early termination.

### Modified Capabilities

- `user-management`: user creation and role mutation gain the seat-cap check (422) —
  captured inside the `seat-management` delta at this change's proposal depth.
- `authorization`: permission checks gain a sibling module-entitlement check — captured
  inside the `plan-entitlements` delta.
- `authentication`: `GET /auth/me` additionally returns the tenant's resolved feature
  flags and entitlements — captured inside the `feature-flags` delta.

## Impact

- **Packages**
  - `@erp/contracts` — `dto/platform.ts` grows the control-plane router
    (`platformContract`: platform auth, tenant CRUD + lifecycle, plans, features, support
    sessions, export); `enums/tenancy.ts` gains `PlanCode`, `SupportSessionScope`,
    `TenantExportStatus`; `enums/error-code.ts` gains `TENANT_READ_ONLY` (→ 403) and
    `SEAT_LIMIT_EXCEEDED` is deliberately **not** added (seat cap reuses
    `BUSINESS_RULE` → 422, see design D5).
  - `@erp/db` — new `schema/platform/` tables `plan` and `tenant_feature`
    (`platform_admin`, `platform_audit_log`, and `support_session` are created by M7 and
    adopted here, never re-declared); `tenant` gains `plan_id` (FK) and `extra_seats`;
    migration `tooling/drizzle/0013_control_plane.sql` (hand-authored). `plan` is
    `TENANT_EXEMPT` and RLS-less by design — added to M7's parity-test allowlist, not
    given a policy; `tenant_feature` carries `tenant_id` and a `tenant_isolation` policy
    like any business table.
  - `apps/api` — new `platform/` module (provisioning, lifecycle, plans, features,
    seats, platform auth, support sessions, export worker) beside M7's `tenancy/`;
    `TenantStateGuard` enforcing READ_ONLY/SUSPENDED; entitlement + seat services
    consumed by the existing `iam/` services.
  - `apps/web` — minimal platform console route group (platform login, tenant list,
    lifecycle actions, feature overrides, support-session start) gated off
    `DEPLOYMENT_MODE`; tenant-side READ_ONLY banner + seat-limit error surface.
- **Infra**: none new — Postgres/Redis/S3 as shipped. Env additions:
  `SUPPORT_SESSION_DEFAULT_MINUTES`, `SUPPORT_SESSION_MAX_MINUTES`,
  `TENANT_EXPORT_URL_TTL_MINUTES`.
- **Downstream**: **depends on `m7-tenancy-core`** (tenant/tenant_domain tables, RLS,
  `tenantContext`, `tid` claim, hostname resolution — M7 naming assumed verbatim).
  `m9-subscription-billing` consumes `plan`, `tenant.status` transitions, and the
  READ_ONLY definition; `m10-demo-sandbox` consumes the provisioning engine,
  `tenant_feature`, and platform audit. Self-hosted (`DEPLOYMENT_MODE=self-hosted`)
  disables this entire surface except the seat check against the `SELFHOSTED` plan.
