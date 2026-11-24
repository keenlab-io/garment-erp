# Platform Operations Guide

This guide is for vendor staff who run the Garment ERP SaaS platform: platform admins who work the control plane (tenants, plans, billing, support), and on-call operators who keep the system healthy. It is not for customers. Administration inside a tenant (roles, users, onboarding) is covered in the [Tenant Administration Guide](tenant-administration-guide.md). The detailed Kubernetes procedures (bootstrap, secrets, deploy pipeline) are in the [production deployment README](../../infra/k8s/README.md). This guide summarises those procedures and links to them instead of repeating them. Everything here was checked against the code. Where a capability has no UI or no API, the guide says so.

## 1. Platform overview

### Deployment modes

The same build runs in one of two modes. `DEPLOYMENT_MODE` on the API selects the mode:

| Mode | Tenant resolution | Control plane (`/platform`) | Typical use |
|---|---|---|---|
| `cloud` (default) | By the request `Host` header, through the `tenant_domain` table | Registered | The multi-tenant SaaS, the public demo |
| `self-hosted` | Every hostname resolves to the single tenant named by `DEFAULT_TENANT_SLUG` | Not registered | A customer's on-premises install |

In self-hosted mode the API creates the default tenant at boot if it is missing, and puts it on the `SELFHOSTED` plan. The web app has a matching build-time flag. Build it with `VITE_DEPLOYMENT_MODE=self-hosted` to hide the platform console. Production cloud runs `DEPLOYMENT_MODE=cloud` (set in the `erp-config` ConfigMap).

### The platform admin principal

A platform admin is a separate kind of identity. It is not a tenant user.

- Platform admins are stored in `platform_admin`. That table is separate from every tenant's `user` table, and a platform admin belongs to no tenant.
- They sign in at `/platform/login` (**Platform sign-in** / เข้าสู่ระบบแพลตฟอร์ม), not at the tenant `/login`.
- Their tokens carry their own audience. They are signed with `JWT_PLATFORM_SECRET`, or with `JWT_ACCESS_SECRET` when `JWT_PLATFORM_SECRET` is unset. A platform token never passes the tenant guard, and a tenant token never passes the platform guard.
- A platform admin can never act inside a tenant directly. The only way in is a time-boxed, audited [support session](#7-support-sessions).

### How hostnames map to tenants

In cloud mode, every hostname that serves the app needs a row in `tenant_domain`:

| Column | Meaning |
|---|---|
| `hostname` | Unique and case-insensitive. Stored lower-case, without the port or a trailing dot |
| `tenant_id` | The tenant the hostname serves |
| `resolution_mode` | `TENANT` resolves to that one tenant. `DEMO_POOL` routes the request into the public demo pool, which creates a sandbox per guest |

The host is consulted only before login (the login, refresh and tenant-branding requests). After login, the token's tenant claim decides the tenant and the `Host` header is ignored. If a hostname has no row, password login on it fails with the same "invalid credentials" error as a wrong password, so outsiders cannot probe which hostnames exist.

### Tenant kinds and statuses

| Kind | Created by | Purpose |
|---|---|---|
| `CUSTOMER` | **Provision tenant**, or the default tenant from seed/migration | A paying (or piloting) customer |
| `DEMO_TEMPLATE` | Seed, when `DEMO_HOST` is set (slug `demo-template`) | A curation copy of the demo dataset. It is also the tenant the `DEMO_POOL` hostname row points at |
| `DEMO_SANDBOX` | The public demo, one per Google guest | A throwaway sandbox that is purged on sign-out or idle |

| Status | Console label | Effect |
|---|---|---|
| `ACTIVE` | **Active** (ใช้งาน) | Normal operation |
| `READ_ONLY` | **Read-only** (อ่านอย่างเดียว) | Every `GET` works. Mutations are refused with `403 TENANT_READ_ONLY`, except for an allowlist: login, refresh, logout, the tenant's own PDPA export, and report export |
| `SUSPENDED` | **Suspended** (ระงับ) | Every request is refused, including login. Users are told to contact their vendor |
| `PURGING` | **Purging** (กำลังลบข้อมูล) | Terminal. Every request is refused while the purge job deletes the data |

## 2. Platform admin accounts

### Bootstrapping the first admin

The idempotent seed (`packages/db/dist/seed/seed.js`) creates the first platform admin from these variables:

- `SEED_PLATFORM_ADMIN_EMAIL`
- `SEED_PLATFORM_ADMIN_PASSWORD`

In production the seed runs as the one-off seed Job (`infra/k8s/jobs/seed-job.yaml`), not inside an api pod: it needs the database superuser, which the app pods deliberately cannot see. Both variables come from a throwaway `erp-seed` secret that you create just before the Job and delete right after. The Job refuses to start without `SEED_PLATFORM_ADMIN_PASSWORD`, because the built-in default is weak and must never reach production. Follow step 5 of "Cloud go-live" in the [deployment README](../../infra/k8s/README.md).

> **Warning:** The seed inserts the admin with `onConflictDoNothing` on the email address. Re-running the seed **does not** reset a forgotten password, and does not change the password of an existing admin. Never set `SEED_TEST_DATA` in production: it creates test personas that share a weak password.

### Adding, disabling or resetting admins

There is no API and no UI for managing platform admins. The control plane offers only login, refresh, logout and `me` for platform admins. Do these tasks directly in the database:

- **Add an admin.** Run the seed again with a *new* `SEED_PLATFORM_ADMIN_EMAIL`/`SEED_PLATFORM_ADMIN_PASSWORD` pair. Everything else in the seed is idempotent, so this only adds the new admin row. Do not rely on a re-run to repair anything else.
- **Disable an admin.** Set `platform_admin.status` to a value other than `ACTIVE`. The next request from that admin's sessions is refused.
- **Reset a password.** Write a new argon2id hash into `platform_admin.password_hash`. There is no CLI helper for this. One safe pattern is to seed a temporary admin with the new password and copy its hash.

### Session behaviour

| Item | Value |
|---|---|
| Access token lifetime | `JWT_PLATFORM_TTL` (default `30m`) |
| Session or refresh lifetime | `JWT_REFRESH_TTL` (default `7d`). The `platform_session` row expires with it |
| Refresh rotation | None. The refresh token is reused until the session ends |
| Lockout | 5 consecutive failed logins lock the account for 15 minutes |
| Browser storage | The refresh token is kept in `sessionStorage`, so it is scoped to one tab. Closing the tab ends the console session |
| Sign out | **Sign out** (ออกจากระบบ) revokes the session row, which kills both tokens |

Logins and logouts are written to the [platform audit log](#8-platform-audit-log).

## 3. Platform console tour

The console is served by the same web app at `/platform`, which redirects to `/platform/tenants`. The header shows **Platform console** (คอนโซลแพลตฟอร์ม) and three navigation links: **Tenants** (ผู้เช่า), **Quotes** (ใบเสนอราคา) and **Support sessions** (เซสชันซัพพอร์ต), plus **Sign out**. A **Staff guides** (คู่มือสำหรับทีมงาน) link opens these guides in a new tab.

### Platform sign-in (`/platform/login`)

The screen has **Email** (อีเมล), **Password** (รหัสผ่าน) and **Sign in** (เข้าสู่ระบบ). Rejected credentials, an unknown email and a locked account all show the same message: **Those credentials were not accepted.**

### Tenants (`/platform/tenants`)

This is a paginated table of every tenant, with the columns **Name** (ชื่อ), **Slug** (สลัก), **Kind** (ประเภท), **Status** (สถานะ) and **Created** (สร้างเมื่อ).

- The **Status** filter defaults to **All statuses** (ทุกสถานะ). The API also accepts `filter[kind]`, but the UI has no kind filter.
- **Provision tenant** (สร้างผู้เช่าใหม่) opens the provisioning drawer. See [Provision a tenant](#provision-a-tenant).
- The **Manage** (จัดการ) row action opens the **Manage {name}** drawer. It has four sections, in this order:
  1. **Lifecycle** (วงจรสถานะ): status change, PDPA export, and purge.
  2. **Feature overrides** (การกำหนดฟีเจอร์เฉพาะราย): per-tenant feature flags.
  3. **Billing** (การเรียกเก็บเงิน): subscription and invoices.
  4. **Support session** (เซสชันซัพพอร์ต): opens a support session.

### Quotes (`/platform/quotes`)

The **Quote generator** (ตัวสร้างใบเสนอราคา) is a stateless calculator for sales. Nothing is saved.

- The inputs are **Prospect name**, **Plan** (a fixed list of the four plan codes), **Annual fee (excl. VAT)**, **Setup fee (first invoice only)**, **Pay-up-front discount**, and **Term (years)**.
- The **Double-deduction eligibility** block holds the prospect's declarations: **Registered capital is ฿5M or less**, **Annual revenue is ฿30M or less**, and **Declared by**.
- **Compute quote** shows **First-year total (excl. VAT)**. When the benefit applies, it also shows **Estimated tax benefit** with **Estimated saving** and **Effective price** ranges. **Download PDF** renders the quote PDF.

See [Tax-benefit quotes](#tax-benefit-quotes) for when the benefit appears.

### Support sessions (`/platform/support-sessions`)

This lists every support session, with the columns **Tenant** (shown as the tenant UUID), **Reason**, **Scope**, **Expires** and **State**. The state is **Active**, **Ended** or **Expired**. The **End session** (จบเซสชัน) row action revokes a live session. You open new sessions from the tenant's **Manage** drawer, not from this screen.

### Screens that do not exist

The following have an API, or only database access, but no screen:

- the platform audit log
- the plan catalog
- subscription cancellation
- export download
- demo leads
- managing platform admins

Each is covered in its own section below.

## 4. Tenant lifecycle procedures

The examples below call the API directly. Get a platform access token first. Read the password from a prompt or a file, and never put it in shell history:

```bash
curl -s https://<app-host>/api/v1/platform/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin-email>","password":"<password>"}'
# → { "access_token": "...", "refresh_token": "...", "expires_in": 1800 }
export PTOKEN=<access_token>
```

### Provision a tenant

1. Open **Tenants** and select **Provision tenant**.
2. Fill in the form:

   | Field | Rule |
   |---|---|
   | **Company name** | Required |
   | **Slug** | Required. A DNS label: lower-case letters, digits and inner hyphens, at most 63 characters. Unique |
   | **Domain (optional)** | The hostname the tenant will log in on, for example `erp.customer.co.th`. Unique across all tenants |
   | **Plan** | See the warning below. With no plan chosen, the tenant gets `WORKSHOP` |
   | **First admin name** / **First admin email** | Optional, but always supply them for a real customer |

3. Select **Provision**. One transaction creates all of the following:
   - the `tenant` row (kind `CUSTOMER`, status `ACTIVE`)
   - the `tenant_domain` row, mode `TENANT`, if you gave a domain
   - the per-tenant defaults: document sequences, SSO config, Thai tax brackets, advance policy, and the default document template
   - the first tenant super-admin. The username is the email address, and the account has a password identity.

   One audit row records it all. A duplicate slug or hostname returns 409, and nothing is created.
4. The **Tenant provisioned** (สร้างผู้เช่าแล้ว) panel shows a **Temporary password**. It is shown only once. Only its hash is stored, and you cannot retrieve it later. Send it to the customer through a separate channel from the login URL.
5. Set up the edge for the hostname:
   1. Create a DNS record for the hostname that points at the public proxy.
   2. Add a Nginx Proxy Manager proxy host to the same upstream as the main app. Turn on **Websockets Support**, issue a TLS certificate, and leave Host pass-through at its default (on).
   3. Follow the "Cloud go-live" section of the [deployment README](../../infra/k8s/README.md) for the upstream details.
6. Sign in once on the new hostname to confirm the branding and the temporary password work. The customer's first admin then follows the [Tenant Administration Guide](tenant-administration-guide.md).

> **Warning:** The **Plan** dropdown is fed by `GET /api/v1/platform/plans`. That route is declared in the contract but not implemented by the API, so the dropdown is empty and the tenant falls back to `WORKSHOP` (8 seats). To provision on a different plan, call the API with an explicit `plan_id`. Look up plan ids with `SELECT id, code FROM plan;`.

```bash
curl -s https://<app-host>/api/v1/platform/tenants -H "Authorization: Bearer $PTOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Acme Screen","slug":"acme","domain":"erp.acme.example","plan_id":"<uuid>",
       "admin_email":"owner@acme.example","admin_name":"Owner"}'
```

If no domain was given, or the customer later wants another hostname, add one by hand. **There is no API or UI to add a hostname to an existing tenant.** Connect as the bootstrap superuser, the same way the deploy workflow's "Map the production hostname" step does:

```sql
INSERT INTO tenant_domain (hostname, tenant_id, resolution_mode)
SELECT 'erp2.acme.example', id, 'TENANT' FROM tenant WHERE slug = 'acme';
```

Write the hostname in lower case, without a port. Then repeat step 5 (DNS and NPM) for the new hostname.

### Change a tenant's status

1. Open **Manage** on the tenant and go to **Lifecycle**. **Current status** shows the current state.
2. Choose the target in **Move to** (เปลี่ยนเป็น), enter **Reason (required)** (เหตุผล (จำเป็น)), and select **Apply status**.

Only these transitions are allowed. Any other is refused with 409 and the message **Couldn't change the status.** The dropdown lists every status, including some that will be refused.

| From | Allowed to |
|---|---|
| `ACTIVE` | `READ_ONLY` |
| `READ_ONLY` | `ACTIVE`, `SUSPENDED` |
| `SUSPENDED` | `READ_ONLY` |
| `PURGING` | none (reached only through purge) |

To suspend an active tenant, move it to `READ_ONLY` first, then to `SUSPENDED`. Each change is audited with the before and after status and your reason. Write a reason that stands on its own, such as "Unpaid SINV-2026-000123, owner informed 2026-11-03". A reason like "billing" is not enough.

> **Note:** Billing also moves tenants between `ACTIVE` and `READ_ONLY` automatically (see [Dunning](#dunning-timeline)). Billing never sets `SUSPENDED`; suspension is always a human decision.

### PDPA export

Any tenant that is not `PURGING` can be exported. A tenant's own super-admin can also start an export from inside the tenant, even while it is `READ_ONLY`.

1. In **Lifecycle**, select **Export tenant data** (ส่งออกข้อมูลผู้เช่า). The toast says **Export queued**.
2. A `tenant.export` job on the `tenant` queue (run by the worker) writes `tenants/{tenant_id}/exports/{timestamp}.zip` to object storage. The archive holds one JSONL file per tenant table, every stored object of the tenant, and a `manifest.json`. Columns whose names contain `password`, `secret` or `token` are left out.
3. **The console does not show the job id or a download link.** Get the `job_id` from the platform audit log (`entity_type=tenant_export`, `after.job_id`). Then poll:

   ```bash
   curl -s -H "Authorization: Bearer $PTOKEN" \
     https://<app-host>/api/v1/platform/tenants/<tenant_id>/exports/<job_id>
   # → { "status": "PENDING|RUNNING|DONE|FAILED", "file_url": "..." }
   ```

4. Once the status is `DONE`, `file_url` is a presigned URL that is valid for `TENANT_EXPORT_URL_TTL_MINUTES` (default 60).

> **Warning:** In the current cloud deployment, presigned URLs are signed for the in-cluster `S3_ENDPOINT`. A browser outside the cluster cannot open them. The export completes, but the link does not work outside the cluster. Until a public object endpoint or a download proxy exists, fetch the object from inside the cluster with `mc` using the `erp-secrets` credentials (the same pattern as bootstrap step 5 in the [deployment README](../../infra/k8s/README.md)) and hand it over through a secure channel.

Completed jobs are trimmed after the most recent 1000 on the queue. Poll for the result soon after you start the export.

### Purge a tenant

A purge is **irreversible**. It deletes every row that carries the tenant's id, deletes the tenant's object-storage prefix, and then deletes the tenant row. Only the `platform_audit_log` entries survive.

Before you start:

1. Confirm the contractual or legal basis in writing, and record it.
2. Run a PDPA export and confirm you can retrieve it, if the customer is entitled to one.
3. Download any subscription invoices you must keep. `subscription`, `subscription_invoice`, `support_session`, `tenant_feature` and `tenant_domain` rows all carry the tenant id, so the purge deletes them too.
4. Move the tenant to `SUSPENDED` through `READ_ONLY`.

Procedure:

1. Under **Purge (irreversible)** (ลบข้อมูลถาวร (ย้อนกลับไม่ได้)), type the tenant's slug into **Confirmation**. The button stays disabled until the tenant is `SUSPENDED` and the slug matches.
2. Select **Purge tenant**. The tenant moves to `PURGING`, and a `tenant.purge` job is queued (toast: **Purge queued**).
3. The worker deletes the tables in reverse foreign-key order. Each step is idempotent. If the job fails, call purge again on the `PURGING` tenant: the API re-queues the job, and it resumes where it stopped.
4. Confirm completion in the audit log. Look for an entry with `entity_type=tenant`, `action=DELETE`, and `after.phase=PURGE_COMPLETED`, with row and object counts.

## 5. Plans, entitlements, seats and feature flags

### Plan catalog

The seed creates the plan catalog. Seat counts follow the go-to-market plan ([GTM plain-language plan](../Garment_ERP_Go_To_Market_Plain_Language.md)):

| Code | Included seats | GTM positioning |
|---|---|---|
| `WORKSHOP` | 8 | 5–15 staff, one printing method |
| `FACTORY` | 20 | 15–40 staff, several methods. Also used by the demo template and sandboxes |
| `MULTISITE` | 40 | 40+ staff, two or more sites |
| `SELFHOSTED` | 20 | Seat cap for self-hosted installs |

Every plan enables all five module keys by default. Plans differ by seats and price, not by modules. The list-price columns (`annual_fee_min/max`, `setup_fee_min/max`) start empty. Prices are negotiated per subscription.

**Editing plans has no working API or UI.** The contract declares `GET/PATCH /platform/plans`, but the API does not implement those routes. Edit plans in SQL. The seed never overwrites an edited plan:

```sql
UPDATE plan SET included_seats = 25, updated_at = now() WHERE code = 'FACTORY';
UPDATE plan SET features = features || '{"module.reporting": false}'::jsonb WHERE code = 'WORKSHOP';
```

> **Warning:** Setting `annual_fee_min` on a plan changes how provisioning behaves. A new `CUSTOMER` tenant on that plan automatically gets a one-year subscription at that fee.

### Seats

- A user occupies a seat if they are not deleted, their status is `PENDING` or `ACTIVE`, and their permissions go beyond the scan-only set. Scan-only floor accounts and users with no role are free and unlimited.
- The cap is `plan.included_seats + tenant.extra_seats`. When a change would push a user over the cap, it is refused with 422. Tenants can see their own usage. Details are in the [Tenant Administration Guide](tenant-administration-guide.md).
- **To sell extra seats:**
  1. Raise `tenant.extra_seats` in SQL. There is no API or UI for this:

     ```sql
     UPDATE tenant SET extra_seats = 5, updated_at = now() WHERE slug = 'acme';
     ```

  2. If you are billing for the seats, add an `EXTRA_SEATS` line when you issue the invoice. The issue-invoice API accepts `extra_seats: { seats, amount }`, but the console form has no field for it. Issuing that line does **not** change `tenant.extra_seats` itself.

### Feature overrides and resolution order

A tenant's effective flags are resolved in this order:

1. its `tenant_feature` row, if one exists
2. else the plan's `features` default
3. else off

An override takes effect on the tenant's next request. Users do not need to sign in again. Tenant super-admins do **not** bypass a disabled module.

In **Feature overrides**:

1. Enter a **Feature key** (placeholder `module.hr`).
2. Set the **Enabled** toggle.
3. Select **Set override**.

**Remove** deletes the override and the tenant falls back to the plan default. **No overrides — this tenant follows its plan.** means the tenant has no overrides. Every change is audited with the before and after *effective* value.

The API accepts any key string and does not validate it. Use only the keys the code reads:

| Key | Effect |
|---|---|
| `module.hr` | HR and payroll module |
| `module.inventory` | Inventory module |
| `module.production` | Production tracking module |
| `module.sales` | Sales documents module |
| `module.reporting` | Reporting and analytics module |
| `auth.google` | Lets a tenant's *existing* users sign in with Google. It never enables self-signup |

IAM is always available and has no key. Demo sandboxes are created with explicit `module.*` rows turned on. There are no separate "demo path" keys, and the demo guardrails are never flags (see [Public demo operations](#9-public-demo-operations)).

> **Tip:** Before you enable `auth.google` for a tenant, add `https://<tenant-host>/api/v1/auth/oidc/google/callback` as an authorized redirect URI on the Google OAuth client. Google sign-in fails on that host until you do.

## 6. Subscriptions and billing

Billing is offline. There is no payment gateway: you issue invoices and record payments by hand. Only `CUSTOMER` tenants can have a subscription, and a tenant has at most one subscription that is not cancelled.

| Subscription status | Console label | Meaning |
|---|---|---|
| `ACTIVE` | **Active** | Within the paid term |
| `IN_GRACE` | **In grace period** | Past `term_end` but within `BILLING_GRACE_DAYS`. The tenant is unaffected |
| `EXPIRED` | **Expired** | Grace has passed. The tenant is moved to `READ_ONLY` |
| `CANCELLED` | **Cancelled** | Terminal. The tenant is moved to `READ_ONLY` |

### Create a subscription

In **Billing**, if **This tenant has no subscription yet.** is shown, fill in the form:

- **Plan**
- **Annual fee (excl. VAT)**: the negotiated fee
- **Term start**

Then select **Create subscription**. The term ends one year after the start unless the API call sets `term_end`.

> **Warning:** The **Plan** dropdown here also depends on the unimplemented plans route. The **Create subscription** button stays disabled until a plan is chosen, so in practice you must create the subscription through the API:

```bash
curl -s https://<app-host>/api/v1/platform/subscriptions -H "Authorization: Bearer $PTOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tenant_id":"<uuid>","plan_id":"<uuid>","annual_fee":"180000.00",
       "term_start":"2026-12-01T00:00:00+07:00"}'
```

Money always travels as a string, never as a number.

### Issue, download, mark paid, void

- **Issue invoice** (ออกใบแจ้งหนี้). The form takes:
  - **Setup fee (first invoice only)**. Leave it blank for none. It is honoured only on the subscription's first invoice.
  - **Pay-up-front discount**. Leave it blank for the default of two months' fee (`annual_fee × 2/12`).

  Select **Issue**. Invoices are numbered `SINV-{YYYY}-{seq}` (the Bangkok calendar year, from a dedicated sequence) and are VAT-exclusive. The API also accepts `extra_seats` and `due_date`, but the form does not.
- **PDF** renders the invoice through the PDF service and returns a presigned URL that is valid for 15 minutes. The PDF shows the vendor's payee details from the `PLATFORM_*` variables:
  - The PromptPay QR appears only if `PLATFORM_PROMPTPAY_ID` is set.
  - Bank fields that are not set are left off.

  The tenant-facing `PROMPTPAY_ID` is never used on a subscription invoice. The same in-cluster presigned-URL limitation as the PDPA export applies.
- **Mark paid** (บันทึกการชำระเงิน). Enter:
  - **Paid on**
  - **Payment method**: **Bank transfer** or **PromptPay**
  - **Reference**, the transfer reference or slip number (required)
  - **Amount received**

  If the amount differs from the total, the payment is refused unless you tick **The amount differs from the invoice total — record it anyway**. **Record payment** then does all of the following in one transaction:
  - marks the invoice `PAID`
  - extends `term_end` from the *previous* `term_end`, not from today
  - restores the subscription to `ACTIVE`
  - moves the tenant from `READ_ONLY` back to `ACTIVE` if the subscription had `EXPIRED`

  The toast says **Payment recorded — term extended**.
- **Void** applies only to `ISSUED` invoices. A **Reason for voiding** is required. A paid invoice cannot be voided.
- **Cancel a subscription** (`POST /api/v1/platform/subscriptions/{id}/cancel` with a `reason`). This is API only, with no button. It is terminal and moves the tenant to `READ_ONLY`, pending export or purge.

### Dunning timeline

A `billing.dunning` sweep runs in the worker every `BILLING_SWEEP_MS` (default hourly). It is the only process that changes subscription status over time. With the defaults (`BILLING_RENEWAL_LEAD_DAYS=45`, `BILLING_GRACE_DAYS=15`), it does the following:

| When | What happens |
|---|---|
| `term_end − 45d` | A renewal invoice is auto-issued: renewal lines, no setup fee, due date `term_end`. This is skipped if a live invoice already covers the next period |
| T−30, T−14, T−7 | Reminder touchpoints |
| Just after `term_end` | Subscription moves to `IN_GRACE`. T0 reminder. The tenant is still `ACTIVE` |
| Weekly during grace | `GRACE_W1`, `GRACE_W2` reminders |
| After `term_end + 15d` | Subscription moves to `EXPIRED`. The tenant moves to `READ_ONLY`, and a `READ_ONLY` reminder fires |

Every touch is recorded in `subscription.dunning_events` against the current `term_end`. Re-runs and restarts therefore never duplicate an invoice or a reminder. If the sweep was down for a while, only the latest reminder is sent.

Recording payment on the renewal invoice moves `term_end` forward, so the schedule starts again for the new term.

> **Warning:** Reminders are **not emailed**. The control plane has no billing-contact address yet, and the reminder delivery only writes a log line in the worker (`dunning T-14 for tenant …`). Chase renewals yourself. Use the subscription list and the worker logs to see who is due.

### Tax-benefit quotes

The **Estimated tax benefit** block appears only when **all** of the following hold:

- the prospect declared both **Registered capital is ฿5M or less** and **Annual revenue is ฿30M or less**, and entered who declared them
- the quote date is on or before the decree sunset, **31 December 2027**
- `DEPA_CATALOG_REGISTERED=true`

The last condition means the vendor is registered on depa's Thailand Digital Catalog. It defaults to `false`, so production shows no benefit until you turn it on. Turn it on only once the registration is confirmed: the double deduction depends on it.

The rates, the annual cap (฿300,000) and the sunset are versioned data in `apps/api/src/platform/billing/tax-benefit-config.ts`. An amendment to the decree needs a code change and a deploy. Every quote that shows the benefit carries a fixed caveat saying the figures are illustrative and that the customer's accountant must confirm them. Never present the saving as guaranteed.

## 7. Support sessions

A support session is the only way staff can act inside a tenant.

### Open a session

1. Open **Manage** on the tenant and go to **Support session**.
2. Enter **Reason (required)**. Describe the ticket specifically, for example "Ticket #4821: payroll run for Oct stuck in CALCULATING". A reason like "support" is not specific enough. The reason is stored verbatim and stamped on every action.
3. Choose **Scope**:
   - **Read-only**: every request follows the tenant's `READ_ONLY` rules, even if the tenant is `ACTIVE`.
   - **Full access**: acts as the tenant's super-admin.

   Default to **Read-only**.
4. Optionally set **Minutes (optional)**. A blank value means `SUPPORT_SESSION_DEFAULT_MINUTES` (60). A value above `SUPPORT_SESSION_MAX_MINUTES` (240) is refused.
5. Select **Start session**. The panel shows **Access token**. It is shown only once, and there is no refresh. When it expires, open a new session.

You can open a session only against an `ACTIVE` or `READ_ONLY` tenant. A suspended or purging tenant is refused.

> **Note:** The console has no "enter tenant" button. The access token is a tenant-scoped bearer token, and the web app has no way to sign in with it. Use it against the API directly. Because a bearer token decides the tenant, any app hostname works:
>
> ```bash
> curl -s -H "Authorization: Bearer $SUPPORT_TOKEN" https://<app-host>/api/v1/auth/me
> ```

### Audit and ending a session

- Opening and ending a session are written to **both** the tenant's own `audit_log` and the `platform_audit_log`. The customer therefore sees support arrive and leave.
- While the session is live, every audited action is written to both ledgers and stamped with the support session id.
- To end a session early, open **Support sessions** and select **End session**. The token is refused from its next request. An expired session's token stops working on its own.
- If a support session signs out on a demo sandbox, the sandbox is not purged.

### Etiquette

- Use the least scope and the least time that do the job. Start read-only, and open a new full-access session only when you must change something.
- One ticket gets one session and one reason. Do not reuse a token across tickets or share it with colleagues.
- Tell the customer before you make changes under **Full access**. They will see your actions in their audit log.
- End the session as soon as you are done, rather than letting it expire.

## 8. Platform audit log

`platform_audit_log` is append-only. It records control-plane actions, not tenant business data. **There is no UI.** Query it through the API:

```bash
curl -s -H "Authorization: Bearer $PTOKEN" \
  "https://<app-host>/api/v1/platform/audit?tenant_id=<uuid>&entity_type=tenant&from=2026-11-01T00:00:00Z&limit=100"
```

The filters are `entity_type`, `entity_id`, `tenant_id`, `from`, `to`, `limit` (1–100) and `cursor`.

| Recorded | `entity_type` / `action` |
|---|---|
| Platform admin login and logout | `platform_admin` / `LOGIN`, `LOGOUT` |
| Provisioning, status changes, purge requested, started and completed | `tenant` / `CREATE`, `UPDATE`, `DELETE` |
| PDPA export requested (with `job_id`) | `tenant_export` / `CREATE` |
| Feature override set or removed | `tenant_feature` |
| Support session opened and ended, plus actions taken under it | `support_session`, and any entity with `support_session_id` set |
| Subscription create, cancel, and dunning transitions | `subscription` |
| Invoice issue, mark paid, void | `subscription_invoice` / `CREATE`, `UPDATE`, `VOID` |
| Demo sandbox lifecycle, lead capture | `tenant` (kind `DEMO_SANDBOX`), `demo_lead` |

Each row carries:

- `platform_admin_id`. This is null when the system acted, for example the dunning sweep or a demo purge.
- `reason`
- `before` and `after` payloads
- `correlation_id`, which ties together every row written by one unit of work
- `support_session_id`

To trace an incident, find one row, then filter on its `correlation_id`, or join to the tenant's `audit_log` on `support_session_id`. Rows outlive a tenant purge.

## 9. Public demo operations

The public demo lets a prospect sign in with Google and get a private, fully seeded sandbox tenant with super-admin rights.

### How it is wired

- **The demo hostname.** `DEMO_HOST` names the demo hostname. **Only the seed reads it.** When the seed runs with `DEMO_HOST` set, it creates the `demo-template` tenant (kind `DEMO_TEMPLATE`, plan `FACTORY`, seeded with the demo dataset) and a `tenant_domain` row with mode `DEMO_POOL` for that hostname. What turns the demo on at runtime is that row, not the variable.
- **Google sign-in.** It needs `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`. If either is unset, the OIDC endpoints refuse and `GET /api/v1/demo/status` reports the demo as unavailable. To create the client, follow step 2 of "Cloud go-live" in the [deployment README](../../infra/k8s/README.md): a web application client with scopes `openid email profile`, a published consent screen, and the demo host's callback URI. Never set `GOOGLE_OIDC_BASE_URL` in a real deployment.
- **Guest entry.** Send guests to `/demo` on the demo hostname. Sign-in creates a `DEMO_SANDBOX` tenant from the dataset in `packages/db/src/seed/demo/seed-demo-tenant.ts`. It also turns on explicit `module.*` overrides and creates the guest as tenant super-admin, signed in with Google only.

> **Note:** Sandboxes are seeded from code and **never copied from `demo-template`**. Edits made in the template tenant do not reach guests. The template has no users. To look around in it, open a support session against it. To change what guests see, change `seed-demo-tenant.ts` and deploy.

### Limits

| Variable | Default | Effect when hit |
|---|---|---|
| `DEMO_MAX_CONCURRENT_SANDBOXES` | 25 | 503, "The demo is busy right now". The landing page shows the busy message |
| `DEMO_SIGNUP_RATE_PER_IP` | 3 per hour | 429 |
| `DEMO_SIGNUP_RATE_PER_EMAIL` | 2 per day | 429 |
| `DEMO_SANDBOX_IDLE_MINUTES` | 60 | The sandbox is purged after this long with no activity |
| `DEMO_SWEEP_INTERVAL_MS` | 300000 (5 min) | How often the idle sweep runs |

The limits apply only when a sandbox is created. A returning guest resumes their existing sandbox.

The per-IP limit is only meaningful if `req.ip` is the real client address. `TRUST_PROXY_HOPS` must match the proxy chain: `2` in production, for NPM and then the in-pod nginx. The verification step in the [deployment README](../../infra/k8s/README.md) shows how to check this through the `demo:rl:ip:*` keys in Redis.

### Purge and idle sweep

- **End demo & delete my data**, or signing out, moves the sandbox to `PURGING` and queues `demo.purge` on the `demo` queue.
- The `demo.idle-sweep` purges any `ACTIVE` sandbox in two cases: it has been idle longer than `DEMO_SANDBOX_IDLE_MINUTES` (`IDLE`), or it has no live session (`SESSIONS_ENDED`). The sweep also re-queues sandboxes that are stuck in `PURGING`.
- There is no maximum age. An engaged guest is never cut off.

### Guardrails

Guardrails key on `tenant.kind = DEMO_SANDBOX` at each outbound integration, server-side. No flag can turn them off.

- Email and LINE messages are "sunk". They are recorded in the sandbox's audit log as `demo.sunk_email` or `demo.sunk_line` and shown in the UI, but never sent.
- e-Tax submission is refused.
- PromptPay produces a dummy QR.
- PDFs carry a DEMO watermark.

### PDPA and leads

- By default the guest's Google email and name exist only inside the sandbox, and the purge deletes them.
- The demo entry screen has an opt-in checkbox for being contacted, unchecked by default. Only if the guest ticks it does the purge first copy `{email, name, consented_at}` into the control-plane `demo_lead` table and write a `demo_lead` audit row.
- **There is no UI or export for leads.** Read them in SQL:

  ```sql
  SELECT email, name, consented_at FROM demo_lead ORDER BY consented_at DESC;
  ```

  Treat these rows as personal data. Delete a row when the person asks to be forgotten.

### Switching the demo off

| Goal | Action |
|---|---|
| Stop new guests, keep the template | `DELETE FROM tenant_domain WHERE resolution_mode = 'DEMO_POOL';` The idle sweep still purges the remaining sandboxes |
| Stop Google sign-in everywhere | Remove `PROD_GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` and redeploy. This also turns off `auth.google` for every tenant |

Removing `DEMO_HOST` from the ConfigMap alone does **not** turn the demo off.

## 10. System operations

This section summarises the operational picture. The authoritative procedures are in the [deployment README](../../infra/k8s/README.md).

### Topology

Public TLS ends at an external Nginx Proxy Manager. NPM forwards through a Tailscale operator proxy to the `erp-web` pods (nginx, 2 replicas), which serve the SPA and reverse-proxy `/api` and `/socket.io` on the same origin to the `erp-api` Service.

The app runs in namespace `erp`:

- `erp-api`: Deployment, 2 replicas, `APP_ROLE=api`. Serves HTTP and Socket.IO, with the Redis adapter carrying broadcasts across replicas.
- `erp-worker`: Deployment, 1 replica, `APP_ROLE=worker`. Runs the BullMQ processors only, and has no Service.
- `erp-postgres`, `erp-redis`, `erp-minio`: StatefulSets on persistent volumes.

At runtime the API connects as the `erp_app` role, which is subject to row-level security. It must never connect as the superuser, because a superuser bypasses tenant isolation.

### Deploy and roll back

Pushing to `main`, or running the **Deploy** workflow, runs three stages:

1. Verify.
2. Build images and pin them by digest.
3. Deploy:
   1. render the secrets
   2. run the per-SHA migration Job
   3. map the production hostname
   4. `kubectl apply`
   5. wait for `rollout status` on api, worker and web
   6. run a health smoke test inside the pod, then a public-URL smoke test

The pipeline rolls back automatically on failure. To roll back by hand:

```bash
kubectl -n erp rollout undo deploy/erp-api deploy/erp-worker deploy/erp-web
```

A rollback does not revert migrations. Migrations must be **expand then contract**: add a column or table in one release, and drop it in a later one. Old code must keep working against the new schema while a rollout is in progress.

### Health checks

`GET /api/v1/health` returns `{status:"ok", uptime}`. The api and worker probes use it. It is a liveness check only: **it does not test Postgres, Redis or MinIO.** A green health check plus a green `rollout status` does not prove that storage or queues work. Use the playbooks in [section 12](#12-incident-playbooks) for that.

### Workers and queues

Everything runs on the worker over BullMQ, on Redis:

- Queues: `email`, `line`, `pdf`, `mv-refresh`, `payroll`, `report`, `tenant`, `billing`, `demo`, `default`.
- Timed sweeps: production monitor, sales overdue, probation scan, materialized-view refresh, `billing.dunning`, and `demo.idle-sweep`.

Points to keep in mind:

- Redis runs with `--appendonly yes`. Never turn AOF off, or queued jobs are lost on restart.
- Jobs retry 5 times with exponential backoff, and failed jobs are kept for inspection.
- `erp-worker` has a 120-second termination grace period, so that in-flight jobs such as payroll can drain. The shutdown order (close the workers before the DB pool) is deliberate.
- If the worker is down, nothing breaks loudly. Exports, purges, PDFs, dunning and demo purges simply stop.

### Secrets

Secrets are re-rendered from GitHub environment secrets on every deploy. To rotate a secret:

1. Update the secret in GitHub.
2. Re-run the deploy.

Effects of rotating each one:

- `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET`: every tenant session ends. Live support-session tokens stop working too.
- `JWT_PLATFORM_SECRET`: every console session ends. If this secret is unset, rotating the access secret ends console sessions as well.
- `PROD_DB_APP_PASSWORD`: the migration Job applies the new password to `erp_app` before the rollout.
- **`ENCRYPTION_KEY` cannot be rotated.** Changing it makes all stored encrypted national IDs unreadable. Back it up somewhere other than the cluster.

### Object storage

The app does not create the MinIO bucket (`S3_BUCKET`, `erp`). Create it once, and check that the *app* credentials work, by following bootstrap step 5 in the [deployment README](../../infra/k8s/README.md). Until the bucket exists, every document, PDF and export write fails. `S3_ACCESS_KEY`/`S3_SECRET_KEY` must equal the MinIO root credentials, because no separate MinIO user is provisioned.

### Known infrastructure gaps

- **No backups.** Postgres, the Redis AOF and MinIO each sit on a replicated Ceph volume. Replication is not backup.
- MinIO is single-node and holds every generated document.
- Nginx Proxy Manager is configured by hand and is a single point of failure. Its Websockets toggle is a checklist item, not code.
- The browser end-to-end suite does not run against production.

### On-call checklist

```bash
# Overall state
kubectl -n erp get pods -o wide
kubectl -n erp get events --sort-by=.lastTimestamp | tail -30
kubectl -n erp rollout status deploy/erp-api --timeout=60s
kubectl -n erp rollout status deploy/erp-worker --timeout=60s
kubectl -n erp rollout status deploy/erp-web --timeout=60s

# Health through the real nginx path (same as the deploy smoke)
kubectl -n erp exec deploy/erp-web -- wget -qO- --timeout=10 http://127.0.0.1:8080/api/v1/health

# Logs
kubectl -n erp logs deploy/erp-api --tail=200
kubectl -n erp logs deploy/erp-worker --tail=200
kubectl -n erp logs deploy/erp-worker --previous --tail=200   # after a crash

# Data services
kubectl -n erp exec sts/erp-postgres -- pg_isready -U erp
kubectl -n erp exec sts/erp-redis -- redis-cli ping
kubectl -n erp exec sts/erp-redis -- redis-cli llen bull:tenant:wait
kubectl -n erp exec sts/erp-redis -- redis-cli zcard bull:tenant:failed

# SQL console (bootstrap superuser, bypasses RLS: read carefully, write sparingly)
kubectl -n erp exec -it sts/erp-postgres -- psql -U erp -d erp

# Restart (pods re-read secrets)
kubectl -n erp rollout restart deploy/erp-api deploy/erp-worker
```

Swap `tenant` in the Redis keys for any queue name. If `REDIS_URL` selects a database other than 0, add `-n <db>` to `redis-cli`.

## 11. Configuration reference

These variables are validated by `apps/api/src/config/env.schema.ts` when the API starts. A missing or malformed required variable stops the process with a list of every problem. "Required" means the variable has no default.

### Process and network

| Variable | Default | Meaning |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test` or `production` |
| `PORT` | `3000` | HTTP port |
| `APP_ROLE` | `all` | `api` (HTTP and Socket.IO), `worker` (queues), or `all` (both) |
| `TRUST_PROXY_HOPS` | `0` | Reverse proxies that append to X-Forwarded-For. Production uses `2` |

### Database and Redis

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | required | Runtime connection, which must use the `erp_app` role |
| `DB_POOL_MAX` | `10` | Pool size |
| `DATABASE_OWNER_URL` | unset | Owner connection, used by migrate and seed only |
| `REDIS_URL` | required | BullMQ and Socket.IO adapter |

### Tenancy, platform and support

| Variable | Default | Meaning |
|---|---|---|
| `DEPLOYMENT_MODE` | `cloud` | `cloud` or `self-hosted` |
| `APP_DOMAIN` | unset | The cloud app's base domain (optional) |
| `DEFAULT_TENANT_SLUG` | `default` | The single tenant in self-hosted mode |
| `TENANT_EXPORT_URL_TTL_MINUTES` | `60` | Lifetime of the PDPA export download URL |
| `SUPPORT_SESSION_DEFAULT_MINUTES` | `60` | Support session length when none is given |
| `SUPPORT_SESSION_MAX_MINUTES` | `240` | Longest allowed support session |

### Authentication and encryption

| Variable | Default | Meaning |
|---|---|---|
| `JWT_ACCESS_SECRET` | required | Signs tenant access and support tokens |
| `JWT_REFRESH_SECRET` | required | Signs tenant refresh tokens |
| `JWT_ACCESS_TTL` | `15m` | Tenant access token lifetime |
| `JWT_REFRESH_TTL` | `7d` | Tenant refresh lifetime and platform session lifetime |
| `JWT_PLATFORM_SECRET` | unset | Signs platform tokens. Falls back to `JWT_ACCESS_SECRET` |
| `JWT_PLATFORM_TTL` | `30m` | Platform access token lifetime |
| `ENCRYPTION_KEY` | required | 64 hex characters, the AES-256-GCM key for PII. Cannot be rotated |
| `GOOGLE_OAUTH_CLIENT_ID` | unset | Google OIDC client. Both this and the secret are needed for the demo and `auth.google` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | unset | Google OIDC secret |
| `GOOGLE_OIDC_BASE_URL` | unset | Test-only stub IdP. Never set it in a real deployment |

### Billing and payments

| Variable | Default | Meaning |
|---|---|---|
| `PROMPTPAY_ID` | unset | The *tenant-facing* PromptPay payee for sales invoice QR codes |
| `PLATFORM_PROMPTPAY_ID` | unset | The vendor's PromptPay ID on subscription invoices. Unset means no QR |
| `PLATFORM_BANK_NAME` | unset | Vendor bank name on subscription invoices |
| `PLATFORM_BANK_ACCOUNT_NAME` | unset | Vendor account name |
| `PLATFORM_BANK_ACCOUNT_NUMBER` | unset | Vendor account number |
| `DEPA_CATALOG_REGISTERED` | `false` | Allows the double-deduction benefit on quotes |
| `BILLING_GRACE_DAYS` | `15` | Days after `term_end` before the tenant goes `READ_ONLY` |
| `BILLING_RENEWAL_LEAD_DAYS` | `45` | Days before `term_end` that the renewal invoice is auto-issued |
| `BILLING_SWEEP_MS` | `3600000` | Dunning sweep cadence |

### Public demo

| Variable | Default | Meaning |
|---|---|---|
| `DEMO_HOST` | unset | The demo hostname. Read by the seed only |
| `DEMO_MAX_CONCURRENT_SANDBOXES` | `25` | Cap on live sandboxes |
| `DEMO_SANDBOX_IDLE_MINUTES` | `60` | Idle time before a sandbox is purged |
| `DEMO_SWEEP_INTERVAL_MS` | `300000` | Idle sweep cadence |
| `DEMO_SIGNUP_RATE_PER_IP` | `3` | Sandbox creations per IP per hour |
| `DEMO_SIGNUP_RATE_PER_EMAIL` | `2` | Sandbox creations per email per day |

### Storage, mail and modules

| Variable | Default | Meaning |
|---|---|---|
| `S3_ENDPOINT` | required | Object store URL. Presigned URLs are built from it |
| `S3_REGION` | `us-east-1` | Region |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | required | App credentials |
| `S3_BUCKET` | required | Bucket, which must already exist |
| `S3_FORCE_PATH_STYLE` | `true` | Must be `true` for MinIO |
| `SMTP_HOST` / `SMTP_PORT` | `localhost` / `1025` | Outbound mail for report digests |
| `SMTP_USER` / `SMTP_PASS` | unset | SMTP credentials. Without working mail, sends fail into in-app alerts |
| `SMTP_FROM` | `reports@erp.local` | Envelope From address |
| `PROBATION_ALERT_DAYS` | `30` | HR probation-ending alert lead time |
| `PRODUCTION_MONITOR_INTERVAL_MS` | `60000` | Delayed-step and subcontract sweep |
| `SALES_OVERDUE_SWEEP_MS` | `86400000` | Overdue-invoice sweep |
| `MV_REFRESH_FALLBACK_MS` | `3600000` | Fallback materialized-view refresh |
| `MV_REFRESH_DEBOUNCE_MS` | `5000` | Coalescing window for refreshes |
| `INVENTORY_ALLOW_NEGATIVE_STOCK` | `false` | Allow issues beyond on-hand stock |

The following variables are outside the schema. The seed and migration scripts read them, not the API:

- `SEED_PLATFORM_ADMIN_EMAIL` and `SEED_PLATFORM_ADMIN_PASSWORD`
- `SEED_SUPERADMIN_PASSWORD`, for the default tenant's `superadmin`
- `SEED_TEST_DATA`. Never set it in production
- `DATABASE_APP_PASSWORD`, which the migration applies to `erp_app`

The web build reads `VITE_DEPLOYMENT_MODE`.

## 12. Incident playbooks

### A tenant cannot log in

1. **Check the hostname mapping.**

   ```sql
   SELECT d.hostname, d.resolution_mode, t.slug, t.status
   FROM tenant_domain d JOIN tenant t ON t.id = d.tenant_id
   WHERE d.hostname = 'erp.acme.example';
   ```

   If no row comes back, the login fails with "invalid credentials" whatever the password. Insert the mapping (see [Provision a tenant](#provision-a-tenant)). Also check that NPM passes the original `Host`.
2. **Check the status.** `SUSPENDED` or `PURGING` refuses every request with a "contact your vendor" message. `READ_ONLY` still allows login. Fix it through **Lifecycle** if that is appropriate.
3. **Check the user.** If one user is locked out, or the tenant admin lost the temporary password, the tenant's super-admin can fix it. See the [Tenant Administration Guide](tenant-administration-guide.md). If nobody in the tenant can sign in, open a **Full access** support session and reset the user through the API.

### All logins fail after switching to cloud mode

1. Confirm that the production hostname has a `tenant_domain` row. The deploy step "Map the production hostname" inserts it. Check that this step ran, and that `PUBLIC_HOST` matches the hostname users actually type.
2. Confirm that every other served hostname also has a row. In cloud mode nothing falls back to the default tenant.
3. If the API fails to start or to connect, check that `PROD_DB_APP_PASSWORD` is set and that the migration Job log shows `erp_app login password set`.
4. If the switch must be undone, set `DEPLOYMENT_MODE` back to `self-hosted` and redeploy. The `tenant_domain` rows are ignored in that mode.

### The realtime timeline does not update

The symptom: production-tracking timelines only refresh on reload.

1. In the browser dev tools, check whether the `/socket.io` WebSocket upgrade fails.
2. In Nginx Proxy Manager, turn on **Websockets Support** for *that* proxy host. This includes every tenant hostname and the demo hostname.
3. If it still fails, check that the `erp-web` nginx is passing `/socket.io` through, and look in the api logs for Redis adapter errors.

### Document or PDF writes fail

The symptom: uploads, PDF renders, invoice PDFs or exports fail with storage errors, while health checks stay green.

1. Check that the bucket exists, and run the app-credential probe from bootstrap step 5 of the [deployment README](../../infra/k8s/README.md).
2. Confirm that `S3_ACCESS_KEY`/`S3_SECRET_KEY` equal the MinIO root credentials. Then re-run the deploy so the secrets are re-rendered and the pods restart.
3. Check that `erp-minio` is running and its volume is not full.
4. If writes work but **download links** do not open, that is the known in-cluster presigned-URL gap, not an outage.

### Jobs do not process

The symptom: exports stay `PENDING`, PDFs never arrive, demo sandboxes pile up, or dunning stops.

1. Check `kubectl -n erp get pods`. Is `erp-worker` running and Ready? Check its logs, including the previous container's logs after a crash.
2. Run `redis-cli ping` on `erp-redis` and check the queue depths (`llen bull:<queue>:wait`, `zcard bull:<queue>:failed`).
3. Restart the worker with `kubectl -n erp rollout restart deploy/erp-worker`. Its 120-second grace period lets in-flight jobs drain.
4. If Redis lost data, confirm that AOF is still on (`--appendonly yes`). Queued jobs from before the loss are gone. Re-trigger exports and purges by hand. A purge on a `PURGING` tenant can be safely re-requested.

### Demo signups are refused

1. `GET https://<demo-host>/api/v1/demo/status`. If it returns `available:false, busy:false`, then either the `DEMO_POOL` row is missing (re-run the seed with `DEMO_HOST`) or the Google OAuth variables are unset.
2. If it returns `busy:true`, the pool is at `DEMO_MAX_CONCURRENT_SANDBOXES`. Check that the idle sweep is running (worker up) and purging, then consider raising the cap.
3. If guests get 429 errors, the per-IP or per-email rate limit was hit. If many unrelated guests are refused together, `TRUST_PROXY_HOPS` is wrong and they all share the proxy's IP. Check the `demo:rl:ip:*` keys.
4. If Google shows a redirect error, add the demo host's callback URI to the OAuth client.

### A tenant is unexpectedly read-only

1. Read the tenant's audit trail:

   ```bash
   curl -s -H "Authorization: Bearer $PTOKEN" \
     "https://<app-host>/api/v1/platform/audit?tenant_id=<uuid>&limit=50"
   ```

   A `tenant` `UPDATE` with `platform_admin_id: null` and a reason like "Grace period ended … without payment" is the dunning sweep. An entry with an admin id was a person. A subscription cancellation also causes it.
2. Open **Billing**. The subscription will show **Expired** or **Cancelled**.
3. If the customer has paid, select **Mark paid** on the renewal invoice. The term extends and the tenant returns to `ACTIVE` in the same transaction. If the subscription was cancelled, you cannot restore it by payment. Move the tenant back with **Lifecycle** and create a new subscription.
4. If the payment really is outstanding, tell the customer. Reminders are not emailed, so they may not know.

## Known gaps and limitations

This list gathers the gaps described in the sections above, for quick reference:

- The plans API (`GET/PATCH /platform/plans`) is in the contract but not implemented. The **Plan** dropdowns are empty, provisioning defaults to `WORKSHOP`, and **Create subscription** cannot be used from the console.
- There is no API or UI to manage platform admins, add a hostname to an existing tenant, set `extra_seats`, edit plans, cancel a subscription (API only), view the platform audit log, or list demo leads.
- The PDPA export shows no job id or download link in the console. Presigned URLs (exports, invoice and quote PDFs) point at the in-cluster object store and do not open in a browser.
- Dunning reminders are only written to the log, not emailed.
- Support-session tokens can only be used against the API, not in the web app.
- A tenant purge also deletes that tenant's subscription and invoice history.
- `DEMO_HOST` only takes effect through the seed. Edits to the demo template never reach sandboxes.
- The health endpoint checks liveness only. There are no backups, and `ENCRYPTION_KEY` cannot be rotated.
