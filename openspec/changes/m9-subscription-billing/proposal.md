# M9 — Subscription Billing (Offline)

## Why

M8 gives every tenant a plan, a seat cap, and a lifecycle — but nothing makes a tenant
*pay*. M9 is the money loop from
`docs/Garment_ERP_Go_To_Market_Plain_Language.md`, implemented the way Thai SMEs
actually buy software: **offline invoicing**. The vendor issues a subscription invoice;
the customer pays by bank transfer or PromptPay; an internal admin marks it paid; the
term extends. No payment gateway, no card storage, no PCI surface — gateway integration
is an explicit non-goal deferred to a later change.

Three GTM decisions shape everything here. First, **expiry must never be a lockout**:
a lapsed term degrades to a grace period and then to M8's `READ_ONLY` state, where a
factory can still read payroll, run reports, and export its data while a transfer
clears — locking payroll mid-shift over a late bank transfer loses the renewal (GTM
Part 2/3). Second, the **Factory tier's first year deliberately lands just under
฿300,000**, the ceiling of Thailand's Feb-2026 double-deduction decree (≤฿5M registered
capital, ≤฿30M revenue, valid to 31 Dec 2027, vendor registered on depa's Thailand
Digital Catalog) — so quoting must be able to show the after-tax-benefit price. Third,
the GTM is equally explicit that the **฿30M revenue ceiling means medium factories get
nothing** from the decree: the tax-benefit figure is therefore *conditional on
tenant-declared eligibility*, never applied blindly, and always carries the document's
own caveat that figures are illustrative and the customer's accountant confirms them.

The `subscription_invoice` built here is **vendor-side** billing — deliberately separate
from the ERP's own M5 `invoice` (`apps/api/src/sales/`), which belongs to tenants and
their customers. The two share conventions (money strings, sequences, PDF, PromptPay QR
mechanics) but no tables and no state machines.

## What Changes

- **`subscription`**: one active subscription per tenant — plan reference, negotiated
  `annual_fee` (money string), `term_start`/`term_end`, billing anniversary, status
  (`ACTIVE | IN_GRACE | EXPIRED | CANCELLED`), `extra_seats` purchased. Plans gain the
  pricing columns M8 deliberately deferred (list-price ranges, setup-fee ranges).
- **`subscription_invoice`**: issue (platform admin), lines for annual fee / setup fee
  (first term) / extra seats / the **pay-up-front discount worth about two months**,
  VAT-exclusive amounts as money strings, `SINV-`-prefixed numbering from a control-
  plane sequence, PDF rendering, bank-transfer instructions + PromptPay QR from the
  vendor's own payee id (`PLATFORM_PROMPTPAY_ID` — never a tenant's `PROMPTPAY_ID`).
- **Mark-paid → term extends**: an internal admin records payment (date, method
  `BANK_TRANSFER | PROMPTPAY`, reference, amount); in the same transaction the
  subscription's term extends by the invoiced period and, if the tenant had degraded,
  status returns to `ACTIVE` and the tenant leaves `READ_ONLY`. Fully audited in
  `platform_audit_log`.
- **Renewal windows & reminders (dunning)**: a control-plane sweep auto-issues the
  renewal invoice ahead of `term_end` and sends reminder notifications on a declining
  schedule; every touch is recorded.
- **Expiry degradation, not lockout**: `term_end` passes → `IN_GRACE` (tenant stays
  fully `ACTIVE`, banner shown) → grace exhausted → M8 `READ_ONLY` (reads, payroll
  viewing, exports keep working) — never `SUSPENDED` automatically. Suspension remains
  a manual platform-admin decision.
- **Tax-benefit quoting**: a control-plane quote computation (and PDF) that shows list
  price and, **only when eligibility is declared** (capital ≤฿5M, revenue ≤฿30M, quote
  date within decree validity, vendor depa-registered), the after-double-deduction
  price on the first ฿300,000/yr of qualifying spend — always with the mandatory
  illustrative-figures caveat.

## Capabilities

### New Capabilities

- `subscription-lifecycle`: the `subscription` model and state machine, term extension
  on payment, expiry → grace → READ_ONLY degradation reusing M8's canonical read-only
  definition, and recovery on payment.
- `subscription-invoicing`: vendor-side `subscription_invoice` — issue, lines (fee /
  setup / extra seats / up-front discount), numbering, PDF, transfer + PromptPay payment
  instructions, and the audited mark-paid flow.
- `renewal-dunning`: the renewal window (auto-issued renewal invoice), the reminder
  schedule across pre-expiry, grace, and read-only, and its control-plane sweep job.
- `tax-benefit-quoting`: eligibility-conditional after-tax-benefit pricing under the
  Feb-2026 double-deduction decree, with the ฿300k cap, the 31 Dec 2027 sunset, and the
  mandatory accountant caveat.

### Modified Capabilities

- `plan-entitlements` (M8): `plan` gains pricing columns (annual list-price range,
  setup-fee range) — captured inside the `subscription-invoicing` delta at this
  change's proposal depth.
- `tenant-provisioning` (M8): the `ACTIVE → READ_ONLY` transition gains a subscription-
  driven trigger — captured inside the `subscription-lifecycle` delta.

## Impact

- **Packages**
  - `@erp/contracts` — `dto/platform.ts` grows the billing router (subscriptions,
    subscription invoices, mark-paid, quotes); `enums/tenancy.ts` gains
    `SubscriptionStatus`, `SubscriptionInvoiceStatus`, `SubscriptionPaymentMethod`.
    Money stays `moneyString`; arithmetic via `@erp/utils` decimal helpers.
  - `@erp/db` — new `schema/platform/` tables `subscription`, `subscription_invoice`
    (both `TENANT_EXEMPT` — added to M7's parity allowlist, no RLS); pricing columns on
    `plan`; migration `tooling/drizzle/0014_subscription_billing.sql`.
  - `apps/api` — `platform/billing/` (SubscriptionService, SubscriptionInvoiceService,
    DunningWorker, QuoteService) reusing M0 `pdf/`, `queue/`, `sequence` mechanics and
    M8's `PlatformJwtGuard` + `platform_audit_log`; the dunning sweep drives M8's
    lifecycle transitions.
  - `apps/web` — platform console: subscription view, issue-invoice, mark-paid, quote
    generator; tenant-side: renewal/grace banner content (the `TENANT_READ_ONLY`
    surface itself is M8's).
- **Infra**: none new. Env additions: `PLATFORM_PROMPTPAY_ID`,
  `BILLING_GRACE_DAYS` (default 15), `BILLING_RENEWAL_LEAD_DAYS` (default 45),
  `BILLING_SWEEP_MS`.
- **Downstream**: **depends on `m7-tenancy-core`** (tenancy plumbing, exempt-table
  parity test) **and on `m8-tenant-control-plane`** (`plan`, `platform_admin` +
  `platform_audit_log`, the lifecycle state machine and the canonical READ_ONLY
  definition, `tenant.extra_seats`). `m10-demo-sandbox` is unaffected (demo tenants
  never carry subscriptions). Self-hosted deployments (`DEPLOYMENT_MODE=self-hosted`)
  mount none of this — the ฿550k package is invoiced entirely outside the product.
  A future payment-gateway change plugs into `mark-paid` as an additional payment
  recorder; nothing here presumes it.
