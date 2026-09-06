# M9 — Subscription Billing (Offline): Design

## Context

M8 delivered the commercial skeleton: `plan` (seats + entitlements, no money), the
platform-admin principal with `platform_audit_log`, and the tenant lifecycle whose
`READ_ONLY` state is precisely defined (reads, payroll viewing, report/PDF export, and
the PDPA export keep working; business writes 403 `TENANT_READ_ONLY`). M9 adds the
money: who owes what, when the term ends, what happens when it does, and how a quote is
allowed to talk about Thailand's double-deduction decree.

Everything vendor-side reuses shipped mechanics rather than inventing new ones: money
crosses the wire as `moneyString` and is computed with `@erp/utils` decimal helpers
(`lineTotal`, `sumMoney`); PDFs render through M0 `pdf/` (puppeteer); the PromptPay QR
uses the same `promptpay-qr` + `qrcode` pipeline as `apps/api/src/sales/
promptpay.service.ts` but with the vendor's payee id; sweeps are BullMQ repeatable jobs.
The ERP's own M5 sales stack (`invoice`, `payment`, `receipt_tax_invoice`, e-Tax) is
tenant data under RLS — `subscription_invoice` never touches it.

Pricing source: `docs/Garment_ERP_Go_To_Market_Plain_Language.md` — Workshop
฿48–72k/yr (setup ฿30–50k), Factory ฿120–180k/yr (setup ฿80–120k, first year ≈ ฿280k by
design), Multi-site ฿300–450k/yr (setup quoted), Self-hosted ฿550k once + ~฿110k/yr
(sold off-product). Prices exclude VAT. "Quote yearly, not monthly, with a discount
worth about two months for paying up front" (Part 3).

## Goals / Non-Goals

**Goals:**

- One active subscription per tenant with a term that extends only when an internal
  admin marks an invoice paid — the whole loop auditable in `platform_audit_log`.
- Vendor-side invoices a Thai SME can actually pay: PDF + bank details + PromptPay QR.
- Renewal issued early, reminders on a schedule, and expiry that degrades
  (`IN_GRACE` → `READ_ONLY`) instead of locking anyone out.
- Quoting that can show the after-tax-benefit price — but only for declared-eligible
  customers, capped at ฿300k/yr, dead after 31 Dec 2027, and always caveated.

**Non-Goals:**

- **No payment gateway, no cards, no PCI** — explicit non-goal; mark-paid is the seam a
  future gateway change fills.
- **No vendor accounting** — receipts/tax-invoices for the vendor's own books, WHT
  handling on customer payments, and e-Tax filing of subscription invoices stay outside
  the product (open question 2 records the boundary).
- **No self-hosted billing** — the ฿550k package is contracted and invoiced manually;
  `DEPLOYMENT_MODE=self-hosted` mounts nothing from M9.
- **No proration or mid-term plan changes** — upgrades take effect at renewal in M9;
  mid-term upgrade with proration is a later change (open question 3).
- **No automated tax advice** — the quote computes an illustration; it never asserts
  eligibility or a guaranteed saving.

## Decisions

### D1. Offline mark-paid is the only payment path

`POST /platform/subscription-invoices/{id}/mark-paid` (platform admin only) records
`{paid_at, method: BANK_TRANSFER | PROMPTPAY, reference, amount}` and, in the same
`UnitOfWork.withTransaction`: sets the invoice `PAID`, extends `subscription.term_end`
by the invoiced period (from the *previous* `term_end`, not the payment date — paying
late does not shorten the next term; paying early does not extend it twice), restores
`subscription.status` to `ACTIVE`, and (if the tenant had degraded) transitions the
tenant `READ_ONLY → ACTIVE` via M8's lifecycle service. One `platform_audit_log` row
carries the whole before/after.

*Alternative considered:* payment-gateway integration (Omise/GB Prime Pay) — rejected
for M9 per the approved GTM decision: Thai SMEs at this ticket size pay by transfer,
and a gateway adds PCI/KYC surface and fees before there is revenue to justify them.
The mark-paid endpoint is deliberately shaped so a gateway webhook can call the same
service later.

### D2. `subscription_invoice` is control-plane, numbered by its own sequence

`subscription_invoice` lives in `schema/platform/`, `TENANT_EXEMPT`, with jsonb
`lines[]` (`{kind: ANNUAL_FEE | SETUP_FEE | EXTRA_SEATS | UPFRONT_DISCOUNT, description,
amount}` — amounts `moneyString`, the discount negative) and denormalized totals.
Numbers are `SINV-{YYYY}-{seq}` from a dedicated control-plane Postgres sequence.

*Alternatives considered:* reusing the ERP's M5 `invoice` — rejected loudly: that table
is tenant business data under RLS, has a tenant-facing state machine, VAT/WHT columns,
and e-Tax hooks; mixing vendor receivables into it breaks both models. Threading a fake
"platform tenant" through `document_sequence` for numbering — rejected; it would
resurrect the magic-global-tenant pattern M7 exists to kill. A `subscription_invoice_line`
child table — rejected at this volume (a handful of lines, no reporting joins);
jsonb keeps the write atomic and the model small.

### D3. Expiry is a two-stage degradation driven by the dunning sweep

`SubscriptionStatus = ACTIVE | IN_GRACE | EXPIRED | CANCELLED`. The sweep (D5) moves
`ACTIVE → IN_GRACE` when `now > term_end` (tenant stays fully operational; banner
only), and `IN_GRACE → EXPIRED` when `now > term_end + BILLING_GRACE_DAYS` (default
15), which calls M8's `ACTIVE → READ_ONLY` tenant transition. **No automatic path sets
`SUSPENDED`** — cutting off login over money is always a human decision. Mark-paid from
any of these states restores `ACTIVE` (D1). `CANCELLED` is a manual terminal state for
churned tenants (tenant then goes `READ_ONLY` pending export/purge under M8 rules).

*Alternative considered:* immediate `READ_ONLY` at `term_end` — rejected; the GTM is
explicit that a late bank transfer must not interrupt operations, and Thai transfers
plus internal approval cycles routinely take days. The grace banner does the urgency
work; `READ_ONLY` does the enforcement work; payroll reads survive both.

### D4. What READ_ONLY means is M8's definition, referenced not restated

M9 does not define its own degraded mode. `EXPIRED` sets the tenant to M8 `READ_ONLY`,
inheriting exactly: logins work; every read works — payroll runs, payslips, reports,
audit log, PDF rendering; report exports and the PDPA data export work; all business
writes 403 `TENANT_READ_ONLY`. This single definition is what makes "you can always
read your payroll and leave with your data while a transfer clears" a testable
guarantee rather than marketing.

*Alternative considered:* a billing-specific softer mode (e.g. writes allowed in HR
only) — rejected; two read-only definitions would drift, and module-shaped exceptions
reopen every "is this endpoint a write?" question M8's guard already answered.

### D5. One control-plane dunning sweep owns time

A single repeatable BullMQ job (`billing.dunning`, `BILLING_SWEEP_MS`) iterates
subscriptions and is the only writer of time-driven transitions: it auto-issues the
renewal invoice at `term_end − BILLING_RENEWAL_LEAD_DAYS` (default 45, standard lines,
no setup fee), records reminder touches at T−30/T−14/T−7/T0, weekly during grace, and
once on `READ_ONLY` entry, and performs the D3 transitions. It is a **control-plane**
job operating on exempt tables — it does not use M7's `withTenantJob` except for the
final tenant-status write. Touches are persisted (`dunning_events` jsonb on the
subscription) so restarts never double-send; delivery is email to the tenant's billing
contact plus the in-app banner state.

*Alternative considered:* per-tenant scheduled jobs (one BullMQ repeatable per
subscription) — rejected; thousands of repeatables to keep in sync with subscription
edits, versus one idempotent sweep that reads the truth each pass — same trade-off the
M0 sales overdue sweep already settled.

### D6. Tax-benefit quoting is eligibility-conditional, capped, sunset, and caveated

`QuoteService.compute(input)` takes plan, negotiated fees, term, and a **declared
eligibility block** `{registered_capital_at_most_5m: boolean, annual_revenue_at_most_30m:
boolean, declared_by, declared_at}`. The after-tax-benefit figure is computed **only
when** both declarations are true, the quote date is ≤ 2027-12-31, and the vendor's
depa Thailand Digital Catalog registration flag (env/config) is on. The illustration:
qualifying spend = min(first-year total, ฿300,000); extra deduction = qualifying spend
(the second counting of the same baht); estimated saving = extra deduction × the SME
CIT-rate band (shown as the GTM's range, ≈15–20%, i.e. ฿42–56k on ฿280k); effective
price = total − saving range. Amounts beyond ฿300k/yr are shown at list with an
explicit "does not qualify" note. Every quote output — API and PDF — MUST embed the
caveat: figures are illustrative, every business's tax position differs, and the
customer's accountant confirms the actual saving (GTM Part 2, reproduced near-verbatim).
For ineligible or post-sunset quotes the benefit section is **absent entirely**, and the
GTM's alternative pitch (labour/waste/mis-quote savings) is the sales story — the
product prints only the list price.

*Alternative considered:* applying the discount-style tax line to every quote because
"most prospects are small" — rejected loudly: the GTM itself warns the ฿30M revenue
ceiling excludes medium factories, and a quote showing a benefit the customer cannot
claim is worse than no quote — it torpedoes trust and possibly the deal at the
accountant's desk.

### D7. The up-front discount and setup fee are invoice lines, not price fields

`plan` gains list-range columns (`annual_fee_min/max`, `setup_fee_min/max`,
`moneyString`, informational bounds for the console); the *negotiated* `annual_fee`
lives on `subscription`. The pay-up-front discount ("worth about two months", GTM
Part 3) is an explicit `UPFRONT_DISCOUNT` line — default `annual_fee × 2/12` rounded,
editable by the admin — on annual invoices, so the invoice the customer files shows
list price and discount separately (which is also what the ฿300k qualifying-spend math
needs: the decree counts what was actually paid). The `SETUP_FEE` line appears only on
a subscription's first invoice.

*Alternative considered:* storing a discounted net price only — rejected; it hides the
discount from the customer's paperwork, breaks the quote↔invoice reconciliation, and
makes renewal pricing (no discount line unless prepaying again) implicit.

## Risks / Trade-offs

- **[Human mark-paid is a bottleneck and a fat-finger risk]** — wrong invoice or wrong
  amount extends a term incorrectly. → Mark-paid echoes amount-vs-invoice mismatch as a
  422 unless an explicit `accept_partial`/`accept_over` flag is set; everything is one
  audited transaction and a compensating `void`+re-issue path exists. Accepted at this
  customer count.
- **[Clock-driven transitions vs. a down worker]** — if the sweep is down at a term
  boundary, degradation happens late. → Fails soft in the customer's favor; the sweep
  is idempotent and catches up on next run.
- **[Tax rates change / decree amended]** — the CIT band range and sunset date are
  data, not code: quoting reads them from a versioned config block so an amendment is
  an edit, not a release. The caveat shields against figure drift in the interim.
- **[Grace default (15 days) is a guess]** — too short annoys, too long invites
  free-riding. → Env-tunable (`BILLING_GRACE_DAYS`), recorded as open question 1.
- **[jsonb lines forgo SQL-level reporting]** — vendor revenue reporting across
  invoices needs jsonb extraction. → Acceptable at tens of customers; a reporting view
  can be added without a schema break.
- **[Renewal invoice auto-issued for a tenant that intends to churn]** — an unwanted
  `SINV` exists. → Invoices are voidable pre-payment; `CANCELLED` subscriptions are
  skipped by the sweep.

## Migration Plan

Additive; depends on M7 + M8 being merged (exempt-table allowlist, plan, lifecycle).

1. **Contracts**: `SubscriptionStatus` / `SubscriptionInvoiceStatus` /
   `SubscriptionPaymentMethod` enums; billing DTOs + routes on `dto/platform.ts`
   (subscriptions, invoices, mark-paid, void, quote compute/PDF).
2. **DB**: `schema/platform/{subscription,subscription-invoice}.ts` + plan pricing
   columns; hand-authored `tooling/drizzle/0014_subscription_billing.sql` (incl. the
   `SINV` sequence); extend the `TENANT_EXEMPT` allowlist.
3. **API**: `apps/api/src/platform/billing/` — services, dunning worker, quote + PDF
   templates, vendor PromptPay QR; wire lifecycle calls into M8's service; env schema
   additions.
4. **Web**: console billing screens (subscription, issue/mark-paid/void, quote
   generator with the eligibility checklist); tenant grace/renewal banner content.
5. **Tests**: unit (term-extension math, dunning idempotence, quote eligibility/cap/
   sunset), integration (issue → mark-paid → term extends → READ_ONLY recovery),
   e2e (expired tenant reads payroll + exports, cannot write; banner states).

Acceptance: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green; the full
loop demo — provision (M8) → first invoice with setup fee + up-front discount →
mark-paid → term set → clock past term → grace banner → past grace → READ_ONLY with
payroll readable → mark renewal paid → ACTIVE again; quote for an eligible Factory
prospect shows ≈฿280k list and the after-benefit range with the caveat; the same quote
with `annual_revenue_at_most_30m = false` shows no benefit section.

**Rollback**: additive exempt tables; revert branch, drop `0014` objects. Tenant
business data untouched; tenants degrade to nothing worse than `ACTIVE`.

## Open Questions

1. **Grace length** — 15 days default: confirm against real Thai transfer + approval
   cycles once the first customers exist (the env knob makes this cheap to change).
2. **Vendor-side receipt/tax-invoice + WHT** — customers paying a Thai company will
   withhold 3% on service fees and expect a receipt/tax invoice. Does M9 print a
   receipt on mark-paid (net-of-WHT amounts), or does the vendor's external accounting
   handle all of it? (M9 default: external; mark-paid stores the gross/received split
   in `reference` free text. Revisit with the accountant.)
3. **Mid-term upgrades** — Workshop → Factory mid-year: proration, or effective at
   renewal only? (M9 default: at renewal; `extra_seats` purchases mid-term are invoiced
   ad hoc as an `EXTRA_SEATS` invoice without term change.)
4. **Quote persistence** — are quotes stored documents with numbers, or stateless
   computations + PDFs? (M9 default: stateless compute with the declared-eligibility
   block echoed into the PDF; persisting quotes-as-documents lands with a CRM-ish later
   change if needed.)
5. **Post-2027 pricing** — from Jan 2028 the product is effectively ~40% pricier for
   small customers unless the decree is extended (GTM Part 4). The sunset is data
   (D6); the *pricing response* is a business decision out of M9's scope — flagged so
   nobody assumes the quote engine solves it.
