# M10 — Public Demo Tier: Tasks

> Depends on `m7-tenancy-core` (RLS, `tenantContext`, `tid` claims, `withTenantJob`,
> `tenants/{tid}/` S3 prefixing, `tenancy.parity.spec.ts`) and `m8-tenant-control-plane`
> (`tenant`/`tenant_domain`/`tenant_feature`, `platform_audit_log`). Do not start 3–7
> until both are merged.

## 1. Contracts — `packages/contracts/src`

- [ ] 1.1 Extend `enums/tenancy.ts` — add `AuthProvider` (`PASSWORD | GOOGLE`) as const object + type
- [ ] 1.2 Add `dto/demo.ts` — zod schemas: `DemoStatus` (`{ available, busy }` for the landing page), `DemoEntryState` (post-callback: `{ notice_ack_required, lead_opt_in }`), `DemoEndResponse`; OIDC route shapes (`OidcStartQuery`, `OidcCallbackQuery`); `PromptPayQr` gains a `demo: boolean` flag (default false — non-breaking)
- [ ] 1.3 Build `demoContract = c.router({...}, { pathPrefix: API_PREFIX })` — `GET /demo/status` (public), `POST /demo/end` (authenticated; logout + purge trigger), OIDC `GET /auth/oidc/google/start` / `GET /auth/oidc/google/callback` (public); every route via `withErrors(...)`; register `demo: demoContract` on the root `contract` in `dto/index.ts`
- [ ] 1.4 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 2. DB schema, migration & demo seed — `packages/db/src`

- [ ] 2.1 Add `AuthProvider` to `schema/enums.ts` (duplicated from contracts; keep `apps/api/src/enums.parity.spec.ts` green)
- [ ] 2.2 Add `schema/platform/auth-identity.ts` — `auth_identity` (`tenantId`, `userId` FK → `user` `ON DELETE CASCADE`, `provider`, `subject` citext, `email` citext nullable, `lastLoginAt`, audit columns; unique `(tenant_id, provider, subject)`); re-export from `schema/index.ts`
- [ ] 2.3 Add `allow_self_signup boolean NOT NULL DEFAULT false` to the m7 `tenant` table; add `demo_lead` (control-plane: `email` citext, `name`, `consentedAt`, audit columns)
- [ ] 2.4 Register `auth_identity` and `demo_lead` in the m7 `tenancy.parity.spec.ts` `TENANT_EXEMPT` allowlist with a comment citing design D8
- [ ] 2.5 Hand-author `tooling/drizzle/0015_public_demo.sql` (renumber to the next free slot if m9 landed one) — `auth_identity` + unique index, `tenant.allow_self_signup`, `demo_lead`, and the backfill inserting one `PASSWORD` `auth_identity` row per existing `user` (`subject` = username)
- [ ] 2.6 Add `seed/demo/seed-demo-tenant.ts` exporting `seedDemoTenant(tenantId)` — deterministic FK-ordered insert of the Thai demo factory: Thai-named customers, item catalogue + SKUs + stock lots, routing templates, work orders mid-production with `production_scan` history (≥1 delayed step), employees + a completed `payroll_run` + `salary_record`s, quotations + invoices in draft/issued/partially-paid/paid/overdue with `payment` rows, per-tenant `document_sequence` + config rows (`sso_config`, `tax_bracket`, `advance_policy`, `document_template`)
- [ ] 2.7 Seed (dev/cloud bootstrap) the `tenant_domain` row for `DEMO_HOST` with `resolution_mode = DEMO_POOL`, and the `DEMO_TEMPLATE` tenant running the same `seedDemoTenant` for curation
- [ ] 2.8 Verify: `pnpm build && pnpm typecheck && pnpm lint` green; `pnpm db:migrate && pnpm db:seed` clean on a fresh DB; `seedDemoTenant` runs green against a scratch tenant

## 3. OIDC auth — `apps/api/src/auth/oidc`

- [ ] 3.1 Add `openid-client` to `apps/api` runtime deps (or record the minimal-fetch decision in design OQ1 and implement JWKS verification directly)
- [ ] 3.2 Extend `config/env.schema.ts` — `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` (optional; OIDC endpoints refuse when unset), `DEMO_HOST` (optional), `DEMO_MAX_CONCURRENT_SANDBOXES` (default 25), `DEMO_SANDBOX_IDLE_MINUTES` (default 60), `DEMO_SWEEP_INTERVAL_MS` (default 300000), `DEMO_SIGNUP_RATE_PER_IP` (default 3), `DEMO_SIGNUP_RATE_PER_EMAIL` (default 2)
- [ ] 3.3 `OidcService` — build the Google authorize URL (PKCE S256 + signed short-TTL `state` binding the resolved tenant/demo-pool + nonce), exchange the code, verify the ID token (JWKS, `iss`/`aud`/`exp`/`nonce`), return `{ sub, email, email_verified, name }`
- [ ] 3.4 `OidcController` (`@Public()` class-level, ts-rest handlers for `contract.demo`'s OIDC routes) — `/start` refuses when the resolved tenant doesn't enable Google login or OIDC is unconfigured; `/callback` verifies state, then branches: identity match → sign-in; no match + `allow_self_signup` → create user+identity (or hand to `DemoProvisioningService` on the demo pool); no match otherwise → 403, nothing created
- [ ] 3.5 `AuthService.login` — resolve the caller via the `(tenant_id, PASSWORD, username)` `auth_identity` row; refuse OIDC-only users (no `PASSWORD` row) with 401 before any hash check; update `auth_identity.last_login_at` alongside `user.last_login_at`
- [ ] 3.6 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 4. Demo module — `apps/api/src/demo`

- [ ] 4.1 `DemoGuardService` — `isDemoSandbox()`: `currentTenantId()` → tenant `kind` (short-TTL in-process cache keyed by tenant id); exported for the egress seams
- [ ] 4.2 `DemoProvisioningService` — rate-limit check (Redis `INCR`+TTL per IP / per email hash), race-safe concurrent-cap check (advisory lock), then one `uow.withTransaction`: `tenant` (`DEMO_SANDBOX`, `ACTIVE`, `allow_self_signup = true`) → `seedDemoTenant(tenantId)` → guest `user` (`isSuperAdmin`, no password) → `auth_identity` (`GOOGLE`) → `tenant_feature` demo-path defaults → `platform_audit_log` row; issue tokens via `TokenService`; store the lead opt-in flag on the tenant
- [ ] 4.3 `DemoPurgeService` + `demo.purge` worker (`default` queue, job id `demo.purge:{tenantId}`, `DEFAULT_JOB_OPTIONS`) — hard-assert `kind = DEMO_SANDBOX` inside the purge tx; revoke sessions; delete rows in reverse-FK order under the tenant's RLS context; delete the `tenants/{tid}/` S3 prefix via `StorageService`; capture `demo_lead` iff opted-in; delete `auth_identity` → guest `user` → `tenant`; `platform_audit_log` row (counts, never the email on the default path); every step idempotent, missing-tenant job completes as no-op
- [ ] 4.4 Static purge-order spec — derive/verify the reverse-FK delete order from `@erp/db` FK metadata (pattern: `tenancy.parity.spec.ts`); build fails when a tenant-scoped table is missing from the order
- [ ] 4.5 `DemoSweepService` — repeatable `demo.idle-sweep` every `DEMO_SWEEP_INTERVAL_MS` (cloud + worker role only): idle/expired sandboxes → `PURGING` + enqueue purge; `PURGING` tenants with no live job → re-enqueue
- [ ] 4.6 Sign-out path — `POST /demo/end` (and logout on a sandbox session): revoke sessions, `status = PURGING`, enqueue `demo.purge` after commit; `PURGING` tenants refused by the tenancy guard
- [ ] 4.7 `DemoModule` wired into `app.module.ts`; ts-rest handlers for `GET /demo/status` (cap-aware availability) and `POST /demo/end`
- [ ] 4.8 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 5. Guardrail hooks — egress seams

- [ ] 5.1 `reporting/mail.service.ts` + `mail.worker.ts` — consult `DemoGuardService`; sandbox mail is recorded (sink log + audit) and never handed to the nodemailer transport; job completes normally
- [ ] 5.2 LINE producer path (`QUEUES.line`) — sandbox sends recorded and returned for in-app rendering labelled "demo — not delivered"; no LINE API call; works with no LINE credentials configured
- [ ] 5.3 `sales/etax.service.ts` — `submit` throws 422 `BusinessRuleError` for sandboxes before enqueueing
- [ ] 5.4 `sales/promptpay.service.ts` — sandbox path builds the payload from the fixed dummy payee, never reads `PROMPTPAY_ID`, returns `demo: true`, works with `PROMPTPAY_ID` unset
- [ ] 5.5 `pdf/pdf.service.ts` — inject the diagonal `DEMO` watermark into every page when the rendering tenant is a sandbox (tenant known via `withTenantJob` / `tenantContext`)
- [ ] 5.6 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 6. Guest web surface — `apps/web/src`

- [ ] 6.1 Demo landing route (demo host): product blurb, availability from `GET /demo/status` (busy → friendly 503 message), "Continue with Google" → `/auth/oidc/google/start`; prominent deletion notice
- [ ] 6.2 Post-callback entry screen: repeat the deletion notice, unchecked PDPA lead opt-in checkbox, "Enter the demo" — then token storage via the existing `api/token-store` + `session-context` flow (`src/session/`)
- [ ] 6.3 Persistent demo-mode banner inside the shell for sandbox sessions ("demo factory — deleted at sign-out") + "End demo & delete my data" action calling `POST /demo/end` then clearing tokens
- [ ] 6.4 Sunk-message rendering: LINE/email demo sends shown with the "demo — not delivered" label; PromptPay QR labelled "demo — do not pay" when `demo: true`
- [ ] 6.5 `th` + `en` strings for all of the above in the i18n namespaces (th default)
- [ ] 6.6 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 7. Tests (spec acceptance criteria)

- [ ] 7.1 OIDC: tampered/expired/cross-tenant `state` ⇒ 401, no exchange; unknown identity on `allow_self_signup = false` tenant ⇒ 403, zero rows created; known identity ⇒ standard token pair with correct `tid`
- [ ] 7.2 Password login resolves via `auth_identity` `PASSWORD`; OIDC-only guest ⇒ 401 on `/auth/login`; backfill gives every pre-m10 user a `PASSWORD` row
- [ ] 7.3 Provisioning: first sign-in creates tenant + seed + guest + identity atomically (seed failure ⇒ nothing visible, no token); two guests ⇒ two isolated sandboxes (cross-tenant read blocked by RLS); returning guest resumes
- [ ] 7.4 Seed dataset assertions: WOs mid-production with scans and ≥1 delayed step; completed payroll run; invoices in all five states; every module opens without error in a fresh sandbox
- [ ] 7.5 Purge: full-completeness check (no rows for `tenant_id`, empty S3 prefix, identity/user/tenant gone, audit row present); kill-mid-purge then retry completes; duplicate triggers collapse on the deduped job id; non-sandbox tenant ⇒ refused, nothing deleted; missing tenant ⇒ no-op success
- [ ] 7.6 Sweep: idle sandbox purged after `DEMO_SANDBOX_IDLE_MINUTES`; active session untouched; stuck-`PURGING` re-enqueued
- [ ] 7.7 Guardrail integration suite (one test per requirement): no SMTP transport call, no LINE API call, e-Tax 422 with no job, QR payload contains dummy payee and not `PROMPTPAY_ID`, watermark on every rendered page, 429 past the IP/email limits, 503 at the cap with no overshoot under concurrent callbacks
- [ ] 7.8 PDPA: default purge leaves no trace of the email anywhere; opt-in purge writes exactly one `demo_lead` + audit row
- [ ] 7.9 Playwright demo flow (`e2e/`): landing → Google sign-in (stub IdP) → notice + opt-in screen → order tracking, job costing, LINE demo-send visible → end demo → sandbox gone, re-sign-in gets a fresh factory

## 8. Verification

- [ ] 8.1 `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green from the repo root
- [ ] 8.2 `pnpm db:migrate && pnpm db:seed` clean on a fresh DB; migration re-runs are idempotent; `enums.parity` + `tenancy.parity` + purge-order specs green
- [ ] 8.3 Live-stack drive: boot cloud mode with a `DEMO_POOL` domain row, complete a real Google sign-in on `DEMO_HOST`, run the fifteen-minute demo path, sign out, confirm the purge emptied rows + S3 and the audit row exists
- [ ] 8.4 Confirm self-hosted mode (`DEPLOYMENT_MODE=self-hosted`) boots with all demo env unset and exposes no demo endpoint
