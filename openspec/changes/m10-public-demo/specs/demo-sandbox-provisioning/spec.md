## ADDED Requirements

### Requirement: Demo pool host resolution
The system SHALL resolve the demo host via a `tenant_domain` row whose `hostname` equals
`DEMO_HOST` (`garment-erp-demo.keenlab.io`) and whose `resolution_mode = DEMO_POOL` —
the m7 hostname table, not subdomain parsing, because the demo host is not a subdomain of
`APP_DOMAIN` (design D3). A request arriving on a `DEMO_POOL` host resolves to **no**
tenant pre-login; it enables only the demo landing, the OIDC start/callback, and the
public demo-status endpoint. In `DEPLOYMENT_MODE=self-hosted` no `DEMO_POOL` row exists
and the demo surface is entirely absent.

#### Scenario: Demo host serves the demo surface
- **WHEN** an unauthenticated request arrives with `Host: garment-erp-demo.keenlab.io`
  and a matching `DEMO_POOL` `tenant_domain` row exists
- **THEN** the demo landing / OIDC endpoints are served without resolving a tenant

#### Scenario: Unknown host is refused
- **WHEN** a request arrives on a hostname with no `tenant_domain` row
- **THEN** the request is rejected (404 in the uniform envelope), not defaulted into any
  tenant

#### Scenario: Self-hosted has no demo pool
- **WHEN** the API runs with `DEPLOYMENT_MODE=self-hosted`
- **THEN** no `DEMO_POOL` resolution exists and the demo endpoints are not reachable

### Requirement: Per-guest sandbox provisioning on the demo callback
When a verified Google callback on the `DEMO_POOL` host matches no existing sandbox
identity, `DemoProvisioningService` (`apps/api/src/demo/`) SHALL, inside one
`UnitOfWork.withTransaction`: create a `tenant` row with `kind = DEMO_SANDBOX`,
`status = ACTIVE`, `allow_self_signup = true`; run `seedDemoTenant(tenantId)`; create the
guest as a user of that tenant with `isSuperAdmin = true` (tenant super-admin — the
prospect may try everything) and **no** `PASSWORD` identity; create the
`(tenant_id, GOOGLE, sub)` `auth_identity` row; and record the provisioning in
`platform_audit_log`. It then issues the standard token pair with `tid` = the sandbox.
Each guest gets their **own** sandbox — never a shared demo tenant (design D1). If any
step fails, the transaction rolls back; a partially-visible sandbox MUST NOT be issued a
token, and any tenant row that escaped (e.g. seed failure after tenant commit in a retry
scheme) is marked `PURGING` and handed to `demo.purge`.

#### Scenario: First sign-in provisions a sandbox
- **WHEN** a guest completes Google sign-in on the demo host for the first time
- **THEN** a `DEMO_SANDBOX` tenant is created and seeded via `seedDemoTenant`, the guest
  user (tenant super-admin, OIDC-only) and `GOOGLE` identity are created, and a token
  pair with `tid` = the new sandbox is returned

#### Scenario: Two guests never share a sandbox
- **WHEN** two different Google accounts sign in on the demo host
- **THEN** two distinct `DEMO_SANDBOX` tenants exist and neither guest's token can read
  the other's rows (m7 RLS)

#### Scenario: Returning guest resumes their sandbox
- **WHEN** a guest whose sandbox has not yet been purged signs in again on the demo host
- **THEN** the existing `(GOOGLE, sub)` identity is matched, no new tenant is created,
  and a fresh session is issued for the same sandbox with their earlier demo data intact

#### Scenario: Seed failure provisions nothing
- **WHEN** `seedDemoTenant` throws mid-provisioning
- **THEN** the transaction rolls back, no token is issued, and the guest sees a retryable
  error — no half-seeded sandbox is ever entered

### Requirement: Demo seed dataset is a realistic Thai factory
`seedDemoTenant(tenantId)` (`packages/db/src/seed/demo/seed-demo-tenant.ts`) SHALL insert,
for the given tenant and in FK dependency order, a dataset depicting a Thai
custom-apparel/printing factory in Thai and THB — so a prospect sees their own business
and the GTM fifteen-minute demo runs with zero setup. It is a **script**, never a
row-clone of the `DEMO_TEMPLATE` tenant (design D2). At minimum it SHALL contain:
Thai-named customers (shops and corporate buyers); an item catalogue and SKUs covering
blank garments, DTF/sublimation consumables, and finished custom apparel with stock lots
in the seeded warehouse; routing templates and **work orders mid-production with
production-scan history** (some steps done, some in progress, at least one delayed) so
order tracking shows a live floor; a **completed payroll run** for a Thai-named workforce
so job costing can show real labour cost; quotations and **invoices in several states**
(draft, issued/awaiting payment, partially paid, paid, and at least one overdue);
per-tenant document sequences and config rows (`sso_config`, `tax_bracket`,
`advance_policy`, `document_template`) so every module opens without errors. The script
MUST be deterministic and safe to run exactly once per fresh tenant (it runs inside the
provisioning transaction).

#### Scenario: Order tracking demo has live data
- **WHEN** a guest opens production/order tracking in a fresh sandbox
- **THEN** work orders exist in mixed states, with scan history on in-progress steps and
  at least one delayed step visible

#### Scenario: Job costing demo has a costed job
- **WHEN** a guest opens costing for a seeded completed work order
- **THEN** material issues and the completed payroll run yield a real cost breakdown and
  margin against the linked invoice

#### Scenario: Invoices span the lifecycle
- **WHEN** a guest opens the invoice list
- **THEN** invoices are present in draft, issued, partially paid, paid, and overdue
  states with THB amounts and Thai customer names

### Requirement: Demo feature-flag defaults follow the fifteen-minute demo path
Sandbox provisioning SHALL write `tenant_feature` defaults that put the GTM demo path
**on** — order tracking (production), job costing, sales/LINE order updates — and leave
every other module present but toggleable, so a guided demo can widen scope without
re-provisioning. Guardrails MUST NOT be represented as feature flags (design D7): no
`tenant_feature` toggle may arm real email, LINE delivery, e-Tax, or the real PromptPay
payee on a `DEMO_SANDBOX` tenant.

#### Scenario: Demo path is on by default
- **WHEN** a sandbox is provisioned
- **THEN** its `tenant_feature` rows enable order tracking, job costing, and LINE order
  updates

#### Scenario: Flags cannot disarm guardrails
- **WHEN** any `tenant_feature` row of a `DEMO_SANDBOX` tenant is toggled (by the guest
  super-admin or a platform admin)
- **THEN** every `demo-guardrails` requirement still holds

### Requirement: Pre-start deletion notice and PDPA opt-in
Before the guest starts, the demo surface (`apps/web`) SHALL display a prominent notice
— on the landing page before Google sign-in and again on the post-callback entry screen —
stating in the active locale (`th` default, `en`) that **everything the guest enters is
deleted when they sign out or after the idle window**. The entry screen SHALL carry an
**unchecked** opt-in checkbox consenting to be contacted about the product; the choice is
stored on the sandbox and drives lead retention at purge time (design D6,
`demo-sandbox-purge`). The guest MUST be able to proceed without checking it.

#### Scenario: Notice precedes any data entry
- **WHEN** a guest lands on the demo host or completes sign-in
- **THEN** the deletion notice is shown prominently before they can enter the app

#### Scenario: Opt-in defaults to off
- **WHEN** a guest proceeds without touching the consent checkbox
- **THEN** no lead-retention consent is recorded and the purge will delete their email
  with the sandbox
