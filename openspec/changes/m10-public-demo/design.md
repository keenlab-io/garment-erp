# M10 — Public Demo Tier: Design

## Context

M7 gives every business table `tenant_id` + Postgres RLS (`tenant_isolation` on the GUC
`app.tenant_id`), the `tenantContext` ALS with `currentTenantId()`, `tid` in access-token
claims, `withTenantJob` for BullMQ, and `tenants/{tid}/` S3 prefixing. M8 gives the
control plane: tenant provisioning, `tenant.kind` (`CUSTOMER | DEMO_TEMPLATE |
DEMO_SANDBOX`), `tenant.status` (`ACTIVE | READ_ONLY | SUSPENDED | PURGING`),
`tenant_domain` (`resolution_mode = TENANT | DEMO_POOL`), `tenant_feature`, and
`platform_audit_log`. M10 composes those into the public demo the GTM doc's Part 4 sales
motion needs: a dealer-shareable URL where a prospect self-serves the fifteen-minute demo
(order tracking, job costing, LINE order updates) inside a private disposable factory.

Authentication today is password-only (`apps/api/src/auth/` — `PasswordService` argon2id,
`TokenService`, global `JwtGuard`; endpoints per `openspec/specs/authentication/spec.md`).
M10 adds the OIDC identity seam because a demo guest will not create a password — and
because Google login is a plausible later upsell for paying tenants, the seam is general
while the *self-signup* path stays demo-only.

The queue/storage/pdf seams M10 hooks are already in place: `QUEUES.email` is drained by
`reporting/mail.worker.ts` (`MailService` → nodemailer), `QUEUES.line` exists with no
producer yet, `sales/etax.service.ts` enqueues `sales.etax-submit` on `QUEUES.pdf`,
`sales/promptpay.service.ts` builds the QR from `PROMPTPAY_ID`, and `pdf/pdf.service.ts`
`renderHtml` is the single chokepoint every generated PDF passes through.

## Goals / Non-Goals

**Goals:**

- One link → signed-in sandbox in seconds: Google OIDC on `DEMO_HOST`, per-guest
  `DEMO_SANDBOX` tenant, seeded demo factory, guest as tenant super-admin.
- The seeded dataset makes the GTM demo script work with zero setup: live order tracking,
  a costed job, and a LINE update to "send" (sunk) — in Thai, in THB.
- Sandboxes are leak-proof: purge on sign-out plus an idle backstop; purge is idempotent,
  retryable, and complete (rows, S3, identity, user, tenant).
- Sandboxes are harmless: every outbound side effect sunk/disabled/dummied, enforced
  server-side keyed on `tenant.kind`, never on client state or feature flags.
- PDPA-clean: guest PII (the Gmail address) dies with the sandbox unless the guest
  explicitly opts into lead capture.
- The OIDC seam is reusable by paying tenants (Google login on, self-signup still off).

**Non-Goals:**

- **No other IdPs** — `AuthProvider` is `PASSWORD | GOOGLE` only; LINE Login / Microsoft
  are later additions to the same seam.
- **No account linking UI** — a paying tenant's admin linking Google identities to
  existing users is a later change; M10 only guarantees the model supports it.
- **No sandbox-to-customer conversion** — "keep my demo data as my real tenant" is a
  tempting upsell but out of scope; the purge story stays simple.
- **No CAPTCHA / bot defence beyond rate limits** — revisit if abuse shows up.
- **No demo analytics/funnel telemetry** — lead capture is the single opt-in email record.
- **Nothing for self-hosted** — `DEPLOYMENT_MODE=self-hosted` boots with no demo surface.

## Decisions

### D1. Per-guest ephemeral sandbox tenant, not one shared demo tenant

Each guest sign-in provisions a fresh `DEMO_SANDBOX` tenant that only that guest ever
sees. The demo *is* the product's isolation story: the prospect gets super-admin, can
void invoices, break BOMs, and rename employees, and none of it needs supervision.

*Alternative considered:* one shared demo tenant with a nightly reset — rejected. A
prospect at 3pm sees whatever a guest at 2pm did to the invoices: voided documents, junk
customers, or worse (another prospect's company name typed into a quotation). "Reset more
often" just narrows the window; concurrent guests still collide in real time, and a
shared tenant also can't demonstrate the isolation a buyer is implicitly evaluating.
Per-guest tenants cost one seed run (~a few hundred rows) per sign-in — trivial next to
the sales value.

### D2. Seed each sandbox by running a script, not by cloning `DEMO_TEMPLATE` rows

`seedDemoTenant(tenantId)` (`packages/db/src/seed/demo/seed-demo-tenant.ts`) inserts the
demo dataset directly for the given tenant, in FK dependency order, reusing the idempotent
style of `packages/db/src/seed/seed.ts`. The `DEMO_TEMPLATE` tenant kind still exists (m8
ships the enum) as the place a platform admin curates and test-drives the dataset, but sandbox
creation never copies its rows.

*Alternative considered:* `INSERT … SELECT` cloning of the template tenant's rows —
rejected. 44 FK-linked tables means every cloned row's generated id must be remapped in
dependency order (`work_order` → `work_order_step` → `production_scan`, `invoice` →
`payment`, …), self-FKs (`routing_step`, `role.cloned_from`) make it worse, and the clone
buys nothing: the dataset is static and versioned in code either way. A script is
testable (`seedDemoTenant` runs in CI against a scratch tenant), diffable in review, and
free of remapping bugs by construction.

### D3. Hostname table (`tenant_domain`), not subdomain parsing

`DEMO_HOST` (`garment-erp-demo.keenlab.io`) resolves through a `tenant_domain` row with
`resolution_mode = DEMO_POOL`. This is m7's mechanism, and the demo host is the proof it
must be a **table**: `garment-erp-demo.keenlab.io` is not a subdomain of `APP_DOMAIN`, so
`*.appdomain` string parsing could never resolve it — and the exact same table row later
serves a paying factory that wants `erp.theirfactory.co.th` (`resolution_mode = TENANT`).

*Alternative considered:* parse the tenant slug out of the request host's subdomain —
rejected. It cannot express off-domain hosts (the demo host today, customer vanity
domains tomorrow), and it turns tenant resolution into string surgery instead of a lookup
with an explicit mode.

### D4. Purge on explicit sign-out PLUS an idle/session-expiry backstop sweep

Explicit sign-out on a sandbox marks the tenant `PURGING` and enqueues `demo.purge`
after commit. But sign-out alone is insufficient: **most guests close the tab** — no
logout request ever arrives, and sandboxes (rows, S3 objects, a Gmail address) would leak
forever, which is both a cost leak and a PDPA retention violation. So a repeatable
`demo.idle-sweep` job (worker role, like the existing sales-overdue/production-monitor
sweeps) iterates `DEMO_SANDBOX` tenants and enqueues `demo.purge` for any whose last
session activity is older than `DEMO_SANDBOX_IDLE_MINUTES` or whose sessions are all
expired/revoked; it also re-enqueues tenants stuck in `PURGING` (a crashed purge).

*Alternative considered:* purge only on logout, with short session TTLs doing the rest —
rejected. Session expiry logs the guest out but deletes nothing; the data outlives the
session indefinitely. The sweep is the only mechanism that bounds sandbox lifetime
unconditionally.

### D5. Self-service signup gated per-tenant by `allow_self_signup`

`tenant.allow_self_signup boolean NOT NULL DEFAULT false`. The OIDC callback creates a
new user only when the resolved tenant context permits it — which in practice is only the
demo pool (sandbox provisioning). On any `CUSTOMER` tenant with the flag off (the
default, and m8's provisioning never sets it), an unknown Google identity is refused with
403 and **no user row is created**: otherwise anyone with a Gmail address could walk into
a real factory's tenant. The OIDC *seam* stays general — a paying tenant can enable
Google login for **existing, admin-created** users (identity matched by
`(tenant_id, GOOGLE, subject)`) without ever enabling self-signup.

*Alternative considered:* a global `DEMO_SELF_SIGNUP` env switch — rejected. It couples
signup policy to deployment config instead of tenant state, cannot express "this one
tenant runs an open pilot", and a misconfiguration opens *every* tenant at once. The
per-tenant flag fails closed per tenant.

### D6. PDPA: purge the Gmail address with the sandbox; lead capture is explicit opt-in

The guest's Google email and display name are personal data under the PDPA. Default
behaviour: they exist only in the sandbox's `user` + `auth_identity` rows and are deleted
by the purge — nothing survives. The signup screen carries an **unchecked** opt-in
checkbox ("you may contact me about the product"); only when checked does the purge first
copy `{ email, name, consented_at }` into a platform-side `demo_lead` record (control
plane, `TENANT_EXEMPT`) and note the capture in `platform_audit_log`. The purge audit row
itself carries the tenant id and counts, never the email, in the default path.

*Alternative considered:* silently retain every guest email as a sales lead ("they gave
it to Google anyway") — rejected outright. That is collection without consent, exactly
what the PDPA's consent rules prohibit, and one complaint to the PDPC costs more than
every lead the list would ever produce. Opt-in also yields a better list: an address
given willingly is a warm lead.

### D7. Guardrails key on `tenant.kind = DEMO_SANDBOX`, server-side, at the egress seam

`DemoGuardService.isDemoSandbox()` (reads `currentTenantId()` → cached tenant kind) is
consulted **inside** each egress service — `MailService` before transporting, the LINE
producer before calling the LINE API, `EtaxService.submit`, `PromptPayService.qr`,
`PdfService.renderHtml` — never in controllers or the web app. Sunk messages are recorded
(audit + returned in the response/UI) so the demo's LINE step still *shows* the message
that would have been sent; it just never leaves the building.

*Alternative considered:* drive the guardrails from `tenant_feature` flags (e.g.
`email.enabled = false` on sandboxes) — rejected. Feature flags are a product-gating
mechanism a platform admin is *supposed* to toggle; one mistaken toggle would arm real
email/PromptPay on a sandbox. Safety rails must be un-toggleable and derived from the
tenant's kind, which nothing but provisioning ever sets.

### D8. `auth_identity` shape: hash stays on `user`, table is RLS-exempt

`auth_identity(id, tenant_id, user_id FK, provider, subject citext, email citext,
last_login_at, audit columns)`, unique `(tenant_id, provider, subject)`. Two deliberate
choices inside that:

1. **The argon2id hash stays on `user.password_hash`.** A `PASSWORD` identity row
   (subject = username) exists so "how can this user sign in" is one uniform query and so
   the purge ordering is uniform, but moving the hash into the identity row would churn
   `PasswordService`/`AuthService`/lockout paths for zero demo benefit. *Rejected
   alternative:* `auth_identity.secret_hash` as the new home of the password — cleaner on
   paper, but it rewrites working, audited M1 auth code in a change whose risk budget is
   spent on egress guardrails.
2. **`auth_identity` joins m7's `TENANT_EXEMPT` allowlist** (it carries `tenant_id` as a
   data column but no RLS policy), alongside `tenant_domain`. Reason: on the demo host
   there is no single pre-login tenant — the callback must answer "which sandbox already
   belongs to this Google `sub`?" **across** `DEMO_SANDBOX` tenants before any tenant
   context exists. Access is confined to the auth layer (identity lookup + purge); it is
   never exposed through a list endpoint. *Rejected alternative:* RLS on the table plus a
   platform-side `demo_guest → tenant` mapping table — two sources of truth for the same
   fact, and the mapping table would itself be exempt anyway.

## Risks / Trade-offs

- **[Provisioning latency at sign-in]** — tenant insert + seed script + token issuance sit
  on the OIDC callback path. → Acceptable: the seed is a few hundred rows in one
  transaction (well under a second on the dev stack); the callback page shows a
  "preparing your factory" state. If it ever hurts, pre-warm a small pool of seeded
  sandboxes — explicitly *not* built now (Open Question 3).
- **[Guardrail coverage drift]** — a future module adds a new egress (SMS, webhook) and
  forgets the sandbox check. → Mitigated by putting checks at the shared seams
  (`MailService`, `PdfService`, queue producers) rather than call sites, plus an
  integration test that walks every guardrail; still a standing review item for M11+.
  The `tenancy.parity` pattern doesn't apply (egress isn't schema), so this rides on
  review + tests.
- **[Cross-tenant identity table]** — `auth_identity` is RLS-exempt (D8). → Confined to
  the auth layer; the unique key still embeds `tenant_id`; the cross-tenant Playwright
  suite (m7) gains a case asserting no API surface ever lists identities.
- **[Purge deletes the wrong tenant]** — a bug here destroys a paying customer's data. →
  `DemoPurgeService` hard-asserts `tenant.kind = DEMO_SANDBOX` (re-read inside the purge
  transaction) before deleting anything, refuses otherwise, and the assertion is unit- and
  integration-tested. The worker runs under `withTenantJob`, so RLS additionally scopes
  the row deletes to the target tenant.
- **[Abuse: sandbox farming]** — free Postgres rows + S3 per Google account. → Per-IP and
  per-email rate limits, the concurrent cap, and the idle sweep bound total footprint;
  `DEMO_MAX_CONCURRENT_SANDBOXES` is the hard ceiling on cost.
- **[Google outage or consent-screen misconfig kills the demo]** — the demo has exactly
  one IdP. → Accepted; the landing page fails with a clear message. A vendor-guided
  fallback (sales rep uses a real staging tenant) always exists.
- **[Sunk-but-visible messages confuse prospects]** — a guest may believe the LINE update
  really reached "the customer". → The demo banner + the sink's in-app rendering label
  the message "demo — not delivered"; wording lives in the web tasks.

## Migration Plan

Additive and cloud-only; nothing touches existing tenants' behaviour:

1. **Contracts**: `AuthProvider` in `enums/tenancy.ts`; `dto/demo.ts` registered on the
   root contract. Green build.
2. **DB**: `schema/platform/auth-identity.ts` + `tenant.allow_self_signup` + enum parity;
   `TENANT_EXEMPT` gains `auth_identity` (and `demo_lead`); hand-authored
   `tooling/drizzle/0015_public_demo.sql`; `seed/demo/seed-demo-tenant.ts`.
3. **API**: `auth/oidc/` flow; `demo/` module (provisioning, purge worker, sweep, guard,
   rate limiter); guardrail hooks in the five egress seams; env additions. Boot with the
   new vars unset must still work outside cloud mode (all demo config optional unless
   `DEMO_HOST` is set).
4. **Web**: demo landing/notice/banner/end-demo; Google button behind tenant capability.
5. **Tests**: guardrail integration suite, purge idempotency, self-signup refusal,
   end-to-end demo Playwright flow.

**Rollback**: remove the `tenant_domain` DEMO_POOL row (the host 404s), sweep purges the
remaining sandboxes, then revert — `auth_identity` rows for password users are inert.

## Open Questions

1. **Google OIDC client library** — `openid-client` (heavier, correct-by-default) vs a
   minimal fetch against Google's token endpoint + JWKS (Google's discovery document is
   stable). Default assumption: `openid-client`.
2. **Sandbox lifetime ceiling** — is there a *maximum* age (e.g. 24h) even for an active
   guest, or only the idle rule? Assumed: idle-only, cap via `DEMO_SANDBOX_IDLE_MINUTES`
   (default 60), since an engaged prospect should never be cut off mid-demo.
3. **Pre-warmed sandbox pool** — if callback latency proves annoying on production
   hardware, provision N spare seeded sandboxes ahead of demand and bind the guest at
   callback time. Deferred until measured.
4. **Lead handoff** — where `demo_lead` rows go (export? webhook to a CRM?) is a sales-ops
   question; M10 only persists them and audits the capture.
5. **`SECURITY DEFINER` lookup instead of exempting `auth_identity` (D8.2)** — D8 exempts
   the whole table from RLS so the demo-pool callback can resolve a Google `sub` across
   `DEMO_SANDBOX` tenants pre-login. The cost is that a table holding every user's email
   address in every tenant has no policy behind it, and "access is confined to the auth
   layer" is enforced by convention rather than by the database. The narrower option,
   **not considered in D8**: keep `tenant_id` + a `tenant_isolation` policy on
   `auth_identity`, and expose the one pre-auth query through a single `SECURITY DEFINER`
   function (`auth.identity_lookup(provider, subject)` returning only `(tenant_id,
   user_id)` — never an email, never a set). That is the same mechanism m7 D8 already
   uses for `reporting.refresh_mv`, so it adds no new concept, and it makes the narrow
   exemption a reviewable four-line function instead of a table-wide hole. Resolve before
   implementation; if adopted, D8.2 and the `oidc-authentication` requirement both change,
   and `auth_identity` leaves the `TENANT_EXEMPT` allowlist (task 2.4).
