## ADDED Requirements

### Requirement: Guardrails are server-side and keyed on tenant kind
Demo guardrails are **security requirements**, not demo polish: a sandbox that can send
a real email or LINE message, file a real e-Tax document, or render a PromptPay QR
crediting the vendor's real `PROMPTPAY_ID` is a live incident. Every guardrail below
SHALL key on `tenant.kind = DEMO_SANDBOX` via `DemoGuardService.isDemoSandbox()`
(`apps/api/src/demo/`, reading `currentTenantId()`), enforced inside the egress
service in `apps/api` — never in controllers, the web app, or `tenant_feature` flags
(design D7) — so no toggle, guest action, or platform-admin mistake can disarm one.

#### Scenario: Feature-flag toggles cannot disarm a guardrail
- **WHEN** any `tenant_feature` row of a `DEMO_SANDBOX` tenant is changed by the guest
  super-admin or a platform admin
- **THEN** every guardrail requirement in this capability still holds

#### Scenario: Client cannot opt out
- **WHEN** a request from a sandbox session sets any header, body field, or query
  parameter attempting to mark itself as non-demo
- **THEN** the egress services still treat the tenant as a `DEMO_SANDBOX` (the kind is
  read from the tenant row via `currentTenantId()`, never from the request)

### Requirement: Outbound email is sunk for demo sandboxes
`MailService` (`apps/api/src/reporting/mail.service.ts`) and the `QUEUES.email` worker
path SHALL, when the job's tenant is a `DEMO_SANDBOX`, **never** hand the message to the
nodemailer transport. The sink SHALL record the would-be message (recipient, subject,
rendered body reference) so the UI can show "sent (demo — not delivered)", and the job
completes successfully so callers see the normal flow.

#### Scenario: Digest email from a sandbox never leaves
- **WHEN** any feature of a `DEMO_SANDBOX` tenant enqueues an email job
- **THEN** no SMTP connection is made for that message
- **AND** the sunk message is recorded and surfaced in-app as a demo send

#### Scenario: Real tenants are unaffected
- **WHEN** a `CUSTOMER` tenant enqueues an email job
- **THEN** it is transported normally

### Requirement: LINE messages are sunk for demo sandboxes
The `QUEUES.line` producer/worker path (the demo's "send the customer an order update
over LINE" step) SHALL, for a `DEMO_SANDBOX` tenant, never call the LINE Messaging API.
The sink MUST preserve the demo's payoff: the composed message (Thai text, order status,
link) is recorded and rendered back in the UI labelled as a demo send — the prospect sees
exactly what their customer *would* receive, and no real LINE account is ever messaged.

#### Scenario: Demo LINE update is shown, not delivered
- **WHEN** a sandbox guest sends an order update over LINE
- **THEN** no request reaches the LINE API
- **AND** the message content is shown in-app marked as a demo send

#### Scenario: No LINE credentials are required for the demo
- **WHEN** the deployment has no LINE channel credentials configured
- **THEN** the sandbox LINE step still works end-to-end via the sink

### Requirement: e-Tax submission is disabled for demo sandboxes
`EtaxService.submit` (`apps/api/src/sales/etax.service.ts`) SHALL refuse for a
`DEMO_SANDBOX` tenant **before enqueueing** the `sales.etax-submit` job, returning a 422
`BusinessRuleError` whose message states that e-Tax is disabled in the demo. No e-Tax XML
is generated or stored for a sandbox.

#### Scenario: Sandbox e-Tax submit is refused
- **WHEN** a sandbox guest calls `POST /etax/{invoice_id}/submit`
- **THEN** the response is 422 with the demo-disabled message
- **AND** no job is enqueued and no object lands in storage

### Requirement: PromptPay QR uses a dummy payee for demo sandboxes
`PromptPayService.qr` (`apps/api/src/sales/promptpay.service.ts`) SHALL, for a
`DEMO_SANDBOX` tenant, build the EMVCo payload from a fixed, syntactically valid dummy
payee id and MUST NOT read `PROMPTPAY_ID` at all on that path — a QR crediting the
vendor's real account from a demo invoice is a payment-misdirection incident. The
response SHALL be flagged (`demo: true`) so the UI labels the QR "demo — do not pay". The
dummy path works even when `PROMPTPAY_ID` is unset.

#### Scenario: Sandbox QR never credits the real payee
- **WHEN** a sandbox guest requests `GET /invoices/{id}/promptpay-qr`
- **THEN** the returned payload encodes the dummy payee id
- **AND** the configured `PROMPTPAY_ID` value appears nowhere in the payload or response

#### Scenario: Demo QR works without configuration
- **WHEN** `PROMPTPAY_ID` is unset and a sandbox guest requests a QR
- **THEN** the dummy-payee QR is returned (no 422), labelled as demo

### Requirement: PDFs are watermarked DEMO for demo sandboxes
`PdfService` (`apps/api/src/pdf/pdf.service.ts`) — the single chokepoint for every
generated document (invoices, receipts, payslips, labels, reports) — SHALL stamp a
prominent diagonal `DEMO` watermark on every page rendered for a `DEMO_SANDBOX` tenant,
so no sandbox-generated document can pass as a genuine tax invoice, receipt, or payslip
outside the demo. Workers rendering PDFs receive the tenant via `withTenantJob`, so the
watermark decision is available wherever rendering happens.

#### Scenario: Sandbox invoice PDF is watermarked
- **WHEN** a sandbox guest exports any PDF (invoice, payslip, report)
- **THEN** every page carries the `DEMO` watermark

#### Scenario: Customer tenants render clean documents
- **WHEN** a `CUSTOMER` tenant renders the same document type
- **THEN** no watermark is applied

### Requirement: Sandbox creation is rate-limited per IP and per email
`DemoProvisioningService` SHALL enforce, **before** creating any tenant: at most
`DEMO_SIGNUP_RATE_PER_IP` new sandboxes per source IP per hour and at most
`DEMO_SIGNUP_RATE_PER_EMAIL` per Google email per day (Redis counters with TTL; env
defaults small, e.g. 3 and 2). Exceeding either limit returns 429 in the uniform envelope
with a friendly retry message, creates nothing, and is counted in `platform_audit_log`.
Resuming an existing sandbox is never rate-limited — only creation.

#### Scenario: IP limit blocks the fourth sandbox
- **WHEN** a fourth distinct Google account signs up from the same IP within an hour
  (limit 3)
- **THEN** the response is 429 and no tenant, user, or identity is created

#### Scenario: Returning guest is exempt
- **WHEN** a rate-limited IP is used by a guest whose sandbox already exists
- **THEN** sign-in resumes the sandbox normally

### Requirement: Concurrent sandboxes are capped
Provisioning SHALL count tenants with `kind = DEMO_SANDBOX` (any status except those
already fully purged) and refuse to create a new one once the count reaches
`DEMO_MAX_CONCURRENT_SANDBOXES`, returning 503 in the uniform envelope with a "demo is
busy — try again shortly" message. The cap bounds the platform's worst-case cost and
blast radius; the idle sweep is what frees capacity. The count-and-create MUST be
race-safe (one transaction / advisory lock) so a burst of sign-ins cannot overshoot the
cap.

#### Scenario: At the cap, new guests are turned away politely
- **WHEN** `DEMO_MAX_CONCURRENT_SANDBOXES` sandboxes exist and a new guest signs in
- **THEN** the response is 503 with the friendly busy message and nothing is created

#### Scenario: Purge frees capacity
- **WHEN** the sweep purges idle sandboxes below the cap
- **THEN** the next new guest provisions successfully

#### Scenario: Concurrent sign-ins cannot overshoot
- **WHEN** multiple first-time guests complete callbacks simultaneously near the cap
- **THEN** the number of sandboxes never exceeds `DEMO_MAX_CONCURRENT_SANDBOXES`
