# M9 — Subscription Billing (Offline): Tasks

Section-level outline (proposal depth). Expand to file-level tasks at implementation
time; M7 (`m7-tenancy-core`) and M8 (`m8-tenant-control-plane`) must be merged first.

## 1. Contracts — `packages/contracts/src`

- [ ] 1.1 Add `SubscriptionStatus` (`ACTIVE | IN_GRACE | EXPIRED | CANCELLED`), `SubscriptionInvoiceStatus` (`ISSUED | PAID | VOID`), `SubscriptionPaymentMethod` (`BANK_TRANSFER | PROMPTPAY`), `SubscriptionInvoiceLineKind` (`ANNUAL_FEE | SETUP_FEE | EXTRA_SEATS | UPFRONT_DISCOUNT`) to `enums/tenancy.ts`
- [ ] 1.2 Grow `dto/platform.ts` billing surface: subscription read/create/cancel, invoice issue/list/void/PDF/mark-paid (`{paid_at, method, reference, amount}` — `moneyString`), quote compute (`{plan, fees, term, eligibility: {registered_capital_at_most_5m, annual_revenue_at_most_30m, declared_by, declared_at}}`) + quote PDF; all via `withErrors`, money as `moneyString`
- [ ] 1.3 Verify: `pnpm build && pnpm typecheck && pnpm lint`

## 2. DB schema & migration — `packages/db` + `tooling/drizzle/0014_subscription_billing.sql`

- [ ] 2.1 Add `schema/platform/subscription.ts` (tenant FK unique-active, plan FK, `annual_fee` money, `term_start`/`term_end`, status, `dunning_events` jsonb) and `schema/platform/subscription-invoice.ts` (number, `lines` jsonb, totals, status, paid fields); pricing range columns on `plan`
- [ ] 2.2 Hand-author `0014_subscription_billing.sql` incl. the `SINV` control-plane sequence; both tables `TENANT_EXEMPT` (no RLS) — extend M7's `tenancy.parity.spec.ts` allowlist
- [ ] 2.3 Verify: migrate clean on fresh DB; parity spec green

## 3. Billing services — `apps/api/src/platform/billing`

- [ ] 3.1 `SubscriptionService`: create-at-provisioning hook, cancel, term-extension math (extends from previous `term_end` — D1), status transitions calling M8's lifecycle service for `READ_ONLY` entry/exit
- [ ] 3.2 `SubscriptionInvoiceService`: issue (first-invoice `SETUP_FEE`, `UPFRONT_DISCOUNT` default `annual_fee × 2/12`, decimal helpers from `@erp/utils`), `SINV-{YYYY}-{seq}` numbering, void, mark-paid in one `UnitOfWork.withTransaction` with amount-mismatch 422 unless overridden; every mutation → `platform_audit_log`
- [ ] 3.3 Invoice PDF (M0 `pdf/`): lines, totals ex-VAT, bank-transfer details, PromptPay QR from `PLATFORM_PROMPTPAY_ID` (never a tenant `PROMPTPAY_ID`)
- [ ] 3.4 Verify: `pnpm build && pnpm typecheck && pnpm lint`

## 4. Dunning & degradation — `apps/api/src/platform/billing`

- [ ] 4.1 `billing.dunning` repeatable sweep (`BILLING_SWEEP_MS`): auto-issue renewal at `term_end − BILLING_RENEWAL_LEAD_DAYS`; reminders T−30/T−14/T−7/T0, weekly in grace, once on READ_ONLY entry; persist touches in `dunning_events` for idempotence; skip `CANCELLED`
- [ ] 4.2 Transitions: `ACTIVE → IN_GRACE` at `term_end`, `IN_GRACE → EXPIRED` at `term_end + BILLING_GRACE_DAYS` → M8 tenant `READ_ONLY`; never auto-`SUSPENDED`; mark-paid restores `ACTIVE` + tenant status
- [ ] 4.3 Env schema additions: `PLATFORM_PROMPTPAY_ID`, `BILLING_GRACE_DAYS`, `BILLING_RENEWAL_LEAD_DAYS`, `BILLING_SWEEP_MS`
- [ ] 4.4 Verify: sweep idempotent across restarts (no duplicate reminders/invoices)

## 5. Tax-benefit quoting — `apps/api/src/platform/billing`

- [ ] 5.1 `QuoteService.compute`: benefit only when both eligibility declarations true AND quote date ≤ 2027-12-31 AND vendor depa flag on; qualifying spend `min(total, 300000)`; saving shown as the 15–20% band; over-cap remainder marked non-qualifying; sunset date + rate band read from versioned config, not literals
- [ ] 5.2 Quote PDF: list price, benefit section (eligible only), mandatory caveat block ("figures are illustrative… customer's accountant confirms") on every output; benefit section entirely absent when ineligible or post-sunset
- [ ] 5.3 Verify: `pnpm build && pnpm typecheck && pnpm lint`

## 6. Web — `apps/web`

- [ ] 6.1 Platform console billing screens: subscription view, issue invoice, mark-paid form, void, quote generator with the eligibility checklist defaulting to UNDECLARED (benefit hidden until ticked)
- [ ] 6.2 Tenant-side banner content: `IN_GRACE` countdown and `TENANT_READ_ONLY` renewal message (banner mechanism is M8's)
- [ ] 6.3 Verify: `pnpm build && pnpm typecheck && pnpm lint`

## 7. Tests — acceptance criteria from the delta specs

- [ ] 7.1 Term math: mark-paid extends from previous `term_end`; late payment does not shorten the next term; partial amount 422s without the override flag
- [ ] 7.2 Degradation: past `term_end` → IN_GRACE, tenant fully writable; past grace → tenant READ_ONLY — payroll GET 200, PDPA export 200, business POST 403 `TENANT_READ_ONLY`; mark-paid → ACTIVE again
- [ ] 7.3 Dunning: renewal invoice auto-issued once at the lead window; reminder set fires exactly once per touchpoint across sweep restarts
- [ ] 7.4 Quoting: eligible Factory quote ≈฿280k shows the after-benefit range + caveat; `annual_revenue_at_most_30m = false` → no benefit section; quote dated 2028-01-01 → no benefit section; ฿400k spend shows benefit on ฿300k only
- [ ] 7.5 Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green from the repo root
