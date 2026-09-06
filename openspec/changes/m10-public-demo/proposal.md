# M10 — Public Demo Tier

## Why

The go-to-market plan (`docs/Garment_ERP_Go_To_Market_Plain_Language.md` Part 4/6) sells
this product through a **fifteen-minute demonstration** covering exactly three things —
*"Where is my customer's order right now?"* (order tracking), *"Did we actually make money
on that job?"* (job costing), and sending the customer an order update over **LINE** —
shown to prospects reached through printer/ink dealers and accounting firms. Those
prospects will not sit through an install or a sales call to see it; they need a link a
dealer can put on a business card. M10 makes `garment-erp-demo.keenlab.io` that link: a
guest signs in with their Google account and lands, seconds later, as super-admin of a
**private, disposable, pre-seeded Thai custom-apparel factory** — Thai names, THB, work
orders mid-production, a completed payroll run, invoices in several states — so the
prospect sees their own business, not lorem ipsum.

Two properties are non-negotiable and shape everything here. First, **isolation**: each
guest gets their own `DEMO_SANDBOX` tenant, provisioned at sign-in and purged at sign-out
(plus an idle backstop, because most guests close the tab). A shared demo tenant would
mean the prospect at 3pm sees whatever the guest at 2pm did to the invoices. Second,
**guardrails as security requirements**: a demo tenant that can send a real email or LINE
message, submit a real e-Tax filing, or render a PromptPay QR crediting the vendor's real
`PROMPTPAY_ID` is a live incident, not a demo bug. Every outbound side effect is sunk,
disabled, or dummied for `DEMO_SANDBOX` tenants, enforced server-side.

The Google sign-in seam is deliberately general: `auth_identity` (`provider = PASSWORD |
GOOGLE`) sits alongside password login so a paying tenant can enable Google login later —
but self-service signup is gated per-tenant by `allow_self_signup`, on **only** for the
demo pool, so a Gmail address never walks into a real factory's tenant.

## What Changes

- **OIDC identity seam** (`auth_identity`): a per-user identity table with
  `provider = PASSWORD | GOOGLE`, unique per `(tenant_id, provider, subject)`. Password
  login keeps its argon2id hash on `user.password_hash` and gains a `PASSWORD` identity
  row; Google login is a standard authorization-code + PKCE flow
  (`apps/api/src/auth/oidc/`) that ends in the same `TokenService` access/refresh pair
  (`{ sub, sid, pv, tid }`) — no parallel session mechanism.
- **Self-signup gating**: `tenant.allow_self_signup` (default `false`). An unknown Google
  identity on a tenant with the flag off is refused with no user created. The flag is on
  only for the demo pool.
- **Demo pool resolution**: a `tenant_domain` row for `DEMO_HOST`
  (`garment-erp-demo.keenlab.io`) with `resolution_mode = DEMO_POOL` — the hostname table
  from m7, not subdomain parsing, because the demo host is not a subdomain of `APP_DOMAIN`.
- **Sandbox provisioning**: on the demo host's OIDC callback, provision a `DEMO_SANDBOX`
  tenant, run `seedDemoTenant(tenantId)` (`packages/db/src/seed/demo/`), create the guest
  as tenant super-admin with a `GOOGLE` identity, and issue tokens. A returning guest with
  a live sandbox resumes it. The seed is a **script**, not a row-clone of the
  `DEMO_TEMPLATE` tenant.
- **Demo dataset**: a realistic Thai custom-apparel/printing factory — customers, item
  catalogue and SKUs, work orders mid-production with scan history, a completed payroll
  run, invoices spanning draft → issued → partially paid → paid → overdue — with
  `tenant_feature` defaults putting the 15-minute demo path (order tracking, job costing,
  LINE order updates) on and everything else present but toggleable.
- **Purge**: explicit sign-out marks the tenant `PURGING` and enqueues `demo.purge`; an
  idle/session-expiry **backstop sweep** catches closed tabs. Purge deletes the tenant's
  rows in reverse-FK order, the `tenants/{tid}/` S3 prefix, the `auth_identity`, the guest
  user, and the tenant row — idempotent and retryable at every step.
- **PDPA**: the guest's Gmail address is purged with the sandbox by default; retaining it
  as a sales lead requires an explicit opt-in checkbox at signup, never silent retention.
- **Guardrails** (each its own requirement): outbound email and LINE sunk (recorded and
  shown in-app, never delivered); e-Tax submission disabled; PromptPay QR built from a
  dummy payee and never `PROMPTPAY_ID`; every PDF watermarked `DEMO`; sandbox creation
  rate-limited per IP and per email; a hard cap on concurrent sandboxes.
- **Guest web surface** (`apps/web`): a demo landing with "Continue with Google", a
  **prominent pre-start notice that everything the guest enters is deleted at sign-out**,
  the PDPA opt-in checkbox, an in-app "demo mode" banner, and an explicit
  "End demo & delete my data" sign-out.

## Capabilities

### New Capabilities

- `oidc-authentication`: the general Google OIDC login seam — `auth_identity` matching by
  `(tenant_id, provider, subject)`, authorization-code + PKCE flow ending in standard M0/M7
  tokens, per-tenant enablement, and the `allow_self_signup` gate that keeps self-service
  signup demo-only.
- `demo-sandbox-provisioning`: `DEMO_POOL` host resolution, per-guest `DEMO_SANDBOX`
  tenant creation, `seedDemoTenant(tenantId)` and the contents of the demo dataset,
  demo-path feature-flag defaults, sandbox resumption for returning guests, and the
  pre-start deletion notice + PDPA opt-in.
- `demo-sandbox-purge`: purge on explicit sign-out plus the idle/session-expiry backstop
  sweep; the reverse-FK purge ordering (rows → S3 prefix → auth_identity → user → tenant);
  idempotency and retry; PDPA purge-by-default with opt-in lead capture.
- `demo-guardrails`: the security requirements that make a sandbox harmless — email/LINE
  sinking, e-Tax disabled, dummy PromptPay payee, `DEMO` PDF watermark, per-IP/per-email
  rate limits, and the concurrent-sandbox cap — all keyed server-side on
  `tenant.kind = DEMO_SANDBOX`.

### Modified Capabilities

- `authentication`: password login now resolves the caller through an `auth_identity` row
  with `provider = PASSWORD` (hash stays on `user.password_hash`), refuses password login
  for OIDC-only accounts, and every sign-in method lands in the same session/token model.

## Impact

- **Packages**
  - `@erp/contracts` — `enums/tenancy.ts` gains `AuthProvider` (`PASSWORD | GOOGLE`); new
    `dto/demo.ts` (`demoContract`: demo pool status, OIDC start/callback shapes, end-demo)
    registered on the root `contract`; no change to money/qty or existing DTOs.
  - `@erp/db` — new `schema/platform/auth-identity.ts` (in the m7 `TENANT_EXEMPT`
    allowlist — see design D8); `tenant.allow_self_signup` column; duplicated
    `AuthProvider` in `schema/enums.ts` (parity-tested); `seed/demo/seed-demo-tenant.ts`
    exporting `seedDemoTenant(tenantId)`; hand-authored migration
    `tooling/drizzle/0015_public_demo.sql` (next free number after m8's control-plane
    migration — renumber if m9 lands one first).
  - `apps/api` — new `auth/oidc/` (Google code flow) and `demo/` module
    (`DemoProvisioningService`, `DemoPurgeService` + worker, `DemoSweepService`,
    `DemoGuardService`, rate limiter); guardrail hooks in `reporting/mail.service.ts`,
    the `line` queue producer path, `sales/etax.service.ts`, `sales/promptpay.service.ts`,
    and `pdf/pdf.service.ts`; env additions in `config/env.schema.ts`.
  - `apps/web` — demo landing + pre-start notice + PDPA checkbox, "Continue with Google"
    on the login surface, demo-mode banner, end-demo sign-out; `th`/`en` strings.
- **New runtime dependency**: `openid-client` (or hand-rolled fetch against Google's
  token/JWKS endpoints — decided in tasks) in `apps/api`. No new frontend dependency.
- **Infra**: a Google OAuth client (consent screen + redirect URI on `DEMO_HOST`); DNS for
  `garment-erp-demo.keenlab.io` pointing at the cloud deployment; Redis (already present)
  for the rate-limit counters. New env: `GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET`, `DEMO_HOST`, `DEMO_MAX_CONCURRENT_SANDBOXES`,
  `DEMO_SANDBOX_IDLE_MINUTES`, plus `DEMO_SWEEP_INTERVAL_MS` and the two signup
  rate-limit knobs.
- **Downstream**: **depends on `m7-tenancy-core`** (tenant/`tenant_domain` tables, RLS +
  `tenant_isolation` policies, `tenantContext`/`currentTenantId()`, `tid` claims,
  `withTenantJob`, `tenants/{tid}/` S3 prefixing, the `tenancy.parity.spec.ts`
  `TENANT_EXEMPT` allowlist) and **on `m8-tenant-control-plane`** (tenant provisioning,
  `tenant_feature`, `platform_audit_log`, plan defaults) — their naming per the shared
  brief is assumed verbatim. Self-hosted deployments (`DEPLOYMENT_MODE=self-hosted`) get
  none of this surface: no demo host, no self-signup, no purge sweep. A paying tenant
  enabling Google login later reuses `oidc-authentication` unchanged — only
  `allow_self_signup` stays off.
