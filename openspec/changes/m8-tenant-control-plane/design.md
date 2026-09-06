# M8 — Tenant Control Plane: Design

## Context

M7 delivers isolation: `tenant_id` + forced RLS on all business tables, the `erp_owner` /
`erp_app` role split, `SET LOCAL app.tenant_id` via `UnitOfWork`, the global
`TenantTransactionInterceptor`, the `tid` access-token claim, `tenantContext` /
`currentTenantId()`, hostname resolution via `tenant_domain`, and the split of the old
global `isSuperAdmin` into **tenant** super-admin (per-tenant bypass only). M7's
`tenancy.parity.spec.ts` allowlists control-plane tables as `TENANT_EXEMPT`. The
ownership split with M7 is **settled, not conditional**: M7's `0012_tenancy.sql` creates
`platform_admin`, `platform_audit_log`, and `support_session`, because M7 needs them for
the super-admin split and the support-session audit seam it specifies. M8 creates only
`plan` and `tenant_feature` (plus `tenant.plan_id` and `tenant.extra_seats`) in
`tooling/drizzle/0013_control_plane.sql`, and adopts M7's three tables as they stand.
`tenant_feature` is the one control-plane table that is *not* exempt — it carries
`tenant_id` and an RLS policy, and platform-admin writes reach it through the
control-plane path that sets `app.tenant_id` to the target tenant explicitly.

The commercial requirements come from `docs/Garment_ERP_Go_To_Market_Plain_Language.md`:
plans with included seats (Workshop 8 / Factory 20 / Multi-site 40 / Self-hosted 20),
free scan-only floor accounts, module gating as the add-on path, and the explicit note
that Multi-site means more seats/locations **within one tenant**. M8 builds the
mechanism; prices and terms live in M9.

M8 reuses M0 infra verbatim: `UnitOfWork` + `currentExecutor`, `AppException` subclasses
+ the uniform envelope, `PasswordService`/`TokenService`, `buildPage`, BullMQ `queue/`,
`StorageService`, and the event bus + audit subscriber.

## Goals / Non-Goals

**Goals:**

- One provisioning engine that creates a fully working tenant (domain, config seed,
  sequences, first super-admin) — reused by M10 for demo sandboxes.
- A plan/entitlement model that gates modules and counts seats, with the scan-only
  exemption and a hard 422 at every seat-promoting edge.
- Feature flags with plan defaults and platform-admin overrides, resolved once per
  request and delivered to the web client.
- A platform-admin principal fully separated from tenant users, with its own login,
  token shape, and append-only `platform_audit_log`.
- Support impersonation that is impossible to do quietly: reason, scope, time-box, and
  dual-ledger audit.
- A tenant lifecycle whose READ_ONLY state is precisely defined (M9 depends on it) and a
  PDPA-grade export + purge.

**Non-Goals:**

- **No billing** — subscriptions, invoices, renewal, dunning, quoting are M9.
- **No demo pool** — `DEMO_TEMPLATE`/`DEMO_SANDBOX` provisioning policy, Google OIDC,
  and sandbox guardrails are M10 (M10 calls this change's engine).
- **No self-service tenant signup** — tenants are provisioned by platform admins;
  self-signup exists only behind M10's `allow_self_signup` demo flag.
- **No tenant-facing plan/usage screens** beyond error surfaces and the READ_ONLY
  banner; the in-ERP "my subscription" UX is a later change.
- **No per-seat billing arithmetic** — M8 counts seats and enforces the cap; money is M9.
- **No platform-staff RBAC** — all platform admins are equal in M8 (open question 4).

## Decisions

### D1. One provisioning engine, parameterized by `tenant.kind`

`ProvisioningService.provisionTenant(input)` (`apps/api/src/platform/provisioning.service.ts`)
runs in one `UnitOfWork.withTransaction`: insert `tenant` (kind, plan_id, status
`ACTIVE`), insert `tenant_domain` (resolution_mode `TENANT`), seed the per-tenant config
rows M7 de-globalized (`sso_config`, `tax_bracket` Thai brackets, `advance_policy`,
default `document_template` set, empty `report_schedule`), and create the first tenant
super-admin with a hashed temp password. The GUC is set to the *new* tenant's id for the
seed writes (the platform admin has no `tid`; provisioning is the one sanctioned place
that sets `app.tenant_id` explicitly to a tenant it is creating). M10 calls the same
service with kind `DEMO_SANDBOX` plus its own `seedDemoTenant`.

*Alternative considered:* a separate demo-provisioning path in M10 — rejected; two code
paths for "make a tenant work" guarantees drift, and the M10 brief already mandates
seed-by-script over row-cloning.

### D2. Entitlements are feature flags with reserved `module.*` keys

One resolution mechanism serves both module gating and fine-grained flags:
`plan.features` is a jsonb map of `key → boolean` defaults; `tenant_feature` rows
override per key; anything absent from both is **off**. Module entitlement uses reserved
keys `module.hr`, `module.inventory`, `module.production`, `module.sales`,
`module.reporting` (`module.iam` is always on and not a key). `EntitlementsService.
resolve(tenantId)` returns the merged map, cached per request on `tenantContext`.
Enforcement is in-handler beside `assertPermissions`: `assertModuleEnabled(user, code)`
derives the module from the permission code's first segment and throws
`ForbiddenError` with detail `issue: "module not in plan"` when the key is off. The
add-on upsell is literally a platform admin flipping a `tenant_feature` row.

*Alternative considered:* a separate `plan_module` join table + distinct entitlement
API — rejected; two override mechanisms (modules vs. flags) with identical semantics,
double the admin surface, and M10 already specifies `tenant_feature` as the demo
switchboard.

### D3. Counted seat = can do more than scan

A user occupies a seat iff: `deleted_at IS NULL`, status ∈ {`PENDING`, `ACTIVE`}, and
their effective permission set (M1's role→permission union, or tenant super-admin =
everything) is **not** a subset of `SCAN_ONLY_PERMISSIONS = ["production.scan"]`, a
named constant in `@erp/contracts` `permissions/catalog.ts`. Consequences: floor
accounts with only `production.scan` are free (the GTM's non-negotiable); users with
*no* roles are also free — harmless, because every path that could give them more
(role assign, role edit, permission import, reactivation) re-runs the cap check and
422s before the promotion commits; `DISABLED` users free their seat. The cap is
`plan.included_seats + tenant.extra_seats` (`extra_seats` is the M9 upsell knob,
default 0). `SeatService.assertCapacity(tenantId, delta)` runs inside the same
transaction as the mutation via `currentExecutor`, so two concurrent creates cannot
both slip under the cap (the count query uses the transaction's snapshot plus a
`FOR UPDATE` on the tenant row as the serialization point).

*Alternative considered:* a `user.is_seat_exempt` flag set by admins — rejected; it
diverges from reality the first time a role edit gives an "exempt" user payroll access,
and it makes the cap gameable. Deriving from effective permissions cannot drift.

### D4. Role edits enforce the cap with named casualties

Editing a role (M1 `RoleService.update` / permission import) can flip *many* scan-only
users to counted in one statement. The check therefore runs against the projected
post-edit seat count; on failure the 422's `details[]` names the users who would become
counted, so the admin can see exactly why a role edit is refused. This is deliberately
strict: silently letting a role edit blow past the cap would make the 422 on user
creation meaningless.

*Alternative considered:* allow the edit and mark the tenant over-cap for M9 dunning —
rejected; "hard 422" is the approved commercial decision, and a soft cap invites
permanent over-use with no purchase trigger.

### D5. Seat cap and read-only reuse/extend the error vocabulary deliberately

The over-cap 422 is a plain `BusinessRuleError` (`BUSINESS_RULE` → 422 in
`AllExceptionsFilter`) with `details[]` carrying `{issue: "seat limit reached", …}` plus
the cap and count — no new error code, because the client action (show the message,
link to upgrade) needs no machine dispatch. READ_ONLY is different: the web app must
distinguish "your subscription lapsed" from ordinary 403s to render the renewal banner,
so `ErrorCode` gains **`TENANT_READ_ONLY`** (→ 403), thrown by `TenantStateGuard`.

*Alternative considered:* new codes for both — rejected for seats (vocabulary creep);
reusing `FORBIDDEN` for read-only — rejected (the web cannot distinguish it from a
permission failure without string-matching messages).

### D6. READ_ONLY is enforced by method + allowlist, defined once

`TenantStateGuard` (global, ordered after `JwtGuard`, in `apps/api/src/platform/`)
reads `tenant.status` via the request's tenant context (per-request cached). Rules:
`ACTIVE` → pass. `READ_ONLY` → pass every `GET`, plus an explicit allowlist of
non-GET operations: `POST /auth/login|refresh|logout`, the PDPA export trigger, and
nothing else; all other non-GET → 403 `TENANT_READ_ONLY`. `SUSPENDED` → login itself is
refused with a clear message (only platform admins can act). `PURGING` → as SUSPENDED.
Reads explicitly include payroll, payslips, reports, PDF rendering of existing
documents, and report/data exports — the GTM's "never lock a factory out of payroll
over a late transfer" made concrete. Background sweeps skip tenants whose status ≠
`ACTIVE`; MV refresh may still run (it reads). Production scanning is a write and is
blocked in READ_ONLY — accepted, because M9's grace period exists precisely so paying
tenants never reach READ_ONLY over an in-flight transfer.

*Alternative considered:* permission-set filtering (strip mutating permissions when
read-only) — rejected; it entangles subscription state with the RBAC resolver, bumps
`permissions_version` storms on state flips, and tenant super-admins bypass permissions
anyway.

### D7. `platform_admin` is a table, not a flag; its tokens carry `pid`, never `tid`

Platform admins live in `platform_admin` (citext email unique, argon2id hash, lockout
columns mirroring `user`) with sessions in a `platform_admin` scope. Their access token
claims are `{pid, sid}` — **no `tid`, no `sub`** — so a platform token can never pass
`JwtGuard`'s tenant path or satisfy RLS, and a tenant token can never reach
`/platform/*` (guarded by a separate `PlatformJwtGuard`). Login surface is
`/platform/auth/*` on the app domain (cloud mode only; `DEPLOYMENT_MODE=self-hosted`
does not mount the platform module at all). Every control-plane mutation writes a
`platform_audit_log` row (append-only: actor `platform_admin_id`, action, target tenant,
before/after, correlation id).

*Alternative considered:* a `user.is_platform_admin` flag on some "vendor tenant" —
rejected loudly; it puts operator credentials inside tenant RLS scope, makes the
super-admin split ambiguous again, and one SQL mistake away from cross-tenant reach.

### D8. Support sessions mint short-lived tenant tokens tagged `sup`

`POST /platform/tenants/{id}/support-sessions` requires `reason` (non-empty, stored
verbatim), `scope` (`READ_ONLY | FULL`), and `minutes` (≤ `SUPPORT_SESSION_MAX_MINUTES`,
default `SUPPORT_SESSION_DEFAULT_MINUTES` = 60). It inserts a `support_session` row and
returns a **tenant-scoped access token** whose claims add `sup: <support_session_id>`;
`expires_at` caps the token TTL — there is no refresh token, expiry is the time-box.
Requests bearing `sup`: resolve permissions as tenant super-admin (scope `FULL`) or
read-only (scope `READ_ONLY` also passes through `TenantStateGuard`'s read-only rules);
every audit row written during the request carries the support-session id and lands in
**both** the tenant's `audit_log` (visible to the customer) and `platform_audit_log`.
Sessions can be ended early (`POST …/support-sessions/{id}/end`); `JwtGuard` rejects an
`sup` token whose session row is ended or expired.

*Alternative considered:* platform admin logs in "as" the tenant super-admin user —
rejected; it forges the customer's own identity in their audit trail. The `sup` claim
keeps the true actor attributable end to end.

### D9. Purge is queued, ordered, and terminal; export is the same worker family

`POST /platform/tenants/{id}/purge` requires the tenant to be `SUSPENDED`, flips status
to `PURGING`, and enqueues `tenant.purge` (BullMQ, wrapped in M7's `withTenantJob`).
The worker deletes business rows in reverse-FK order, deletes the `tenants/{tid}/` S3
prefix via `StorageService`, then removes users/sessions/domains and finally the tenant
row; `platform_audit_log` records start and completion (it survives the tenant —
that's why it is a separate exempt table). Export (`tenant.export`) walks the same
table order forward, streaming one JSONL file per table plus stored objects into an
archive at `tenants/{tid}/exports/{ts}.zip`, then presigns
(`TENANT_EXPORT_URL_TTL_MINUTES`). The export endpoint is exposed to **both** the
platform admin and the tenant's own super-admin, and is on the READ_ONLY allowlist
(D6) — PDPA portability cannot depend on being paid up.

*Alternative considered:* synchronous purge/export in the request — rejected; 44+
tables and an S3 prefix walk do not belong in an HTTP timeout, and a half-purged tenant
must be resumable (the queue retries; deletion order makes retries idempotent).

### D10. Plans are seed data; pricing columns wait for M9

`plan` rows (`WORKSHOP` 8, `FACTORY` 20, `MULTISITE` 40, `SELFHOSTED` 20 seats +
`features` defaults) are seeded by migration/seed, editable only by platform admins, and
carry **no** money columns — M9 adds pricing/term fields with its `subscription` model
so that money-as-string conventions land once, next to the code that computes with
them. `MULTISITE` differs from `FACTORY` only in seats and flag defaults — there is no
"second location" object anywhere, per the approved decision.

## Risks / Trade-offs

- **[Seat check on hot IAM paths]** — every user create/role change runs a count query.
  → Small indexed aggregate inside an existing transaction; the tenant-row `FOR UPDATE`
  serializes only concurrent seat-promoting writes in the *same* tenant. Accepted.
- **[Scan-only exemption gaming]** — a tenant could run everyone as scan-only and share
  one counted login. → Accepted commercially; the GTM prices around it (floor data is
  the lock-in). The cap check closes the *technical* loophole (promotion always 422s).
- **[`TenantStateGuard` allowlist drift]** — a new non-GET read-ish endpoint (e.g. a
  report POST) would be wrongly blocked in READ_ONLY. → The allowlist is a named
  constant with a unit test enumerating it; adding to it is a reviewed one-liner.
- **[Support-session scope `FULL` is powerful]** — a support admin can mutate customer
  data. → That is its purpose (fixing a stuck document); mitigated by time-box, reason,
  dual-ledger audit visible to the customer, and early-end. `READ_ONLY` scope is the
  default in the console UI.
- **[Provisioning writes with an explicit GUC]** — D1 sets `app.tenant_id` to the new
  tenant outside a normal user request, a pattern that must not leak elsewhere. → The
  helper lives only in `ProvisioningService`/`withTenantJob`; M7's cross-tenant e2e
  suite is the backstop.
- **[Purge is unrecoverable]** — an operator mistake destroys a customer. → Purge
  requires prior `SUSPENDED` status, a typed confirmation phrase in the API body, and
  is preceded in the console flow by an export; retention windows are open question 3.

## Migration Plan

Additive; no live-tenant data exists before M7+M8 deploy together in cloud mode.

1. **Contracts**: `enums/tenancy.ts` additions (`PlanCode`, `SupportSessionScope`,
   `TenantExportStatus`), `TENANT_READ_ONLY` error code, `SCAN_ONLY_PERMISSIONS`
   constant, `dto/platform.ts` router; register `platform` on the root contract.
2. **DB**: `schema/platform/{plan,platform-admin,platform-audit-log,support-session,
   tenant-feature}.ts`, `tenant.plan_id`/`extra_seats`; hand-author
   `tooling/drizzle/0013_control_plane.sql`; extend M7's `TENANT_EXEMPT` allowlist;
   seed plans + first platform admin (env-provided credentials).
3. **API**: `apps/api/src/platform/` (guards, services, controller, workers); wire
   `TenantStateGuard`; hook `SeatService`/`assertModuleEnabled` into the existing
   `iam/` services; mount platform module only when `DEPLOYMENT_MODE=cloud`.
4. **Web**: platform console route group + READ_ONLY banner + seat-422 surfacing.
5. **Tests**: unit (seat math, flag resolution, state guard), integration (provision →
   login → gated module → seat 422 → support session dual audit → export → purge),
   extend M7's cross-tenant Playwright suite with platform-token/tenant-token
   cross-checks.

Acceptance: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green; a
provisioned tenant is usable end-to-end; the 9th Workshop counted user is a 422 while
scan-only creation still succeeds; READ_ONLY tenant can read payroll and export but not
write; support session appears in the tenant's own audit log.

**Rollback**: control-plane tables are additive and exempt from RLS; revert the branch
and drop `0013` objects. Tenant business data is untouched.

## Open Questions

1. **Platform login hardening** — is password + lockout enough for `/platform/auth`, or
   is TOTP 2FA required before first real customer? (M8 default: password + lockout,
   2FA as an immediate follow-up; the table already reserves a `totp_secret` column.)
2. **Seat-count surface for tenants** — where does a tenant admin *see* "17 of 20 seats
   used, 12 scanner accounts free"? (M8 default: counts returned in the 422 details and
   a `GET /iam/seats` endpoint; a proper usage screen is deferred.)
3. **Purge retention window** — PDPA erasure vs. accounting reality: how long must a
   `SUSPENDED` tenant sit before purge is allowed, and must the operator retain the
   final export? (M8 default: no enforced minimum, console flow strongly suggests
   export-first; confirm with the accountant/lawyer alongside M9's records duties.)
4. **Platform staff roles** — sales staff who may quote (M9) but not impersonate?
   (M8 default: all platform admins equal; revisit when headcount > founders.)
5. **`PENDING` users and seats** — D3 counts `PENDING` (invited, not yet activated)
   users as seated. Confirm this matches how sales wants trials to feel, or exempt
   `PENDING` until first login.
