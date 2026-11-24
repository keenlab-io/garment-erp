# Tenant Administration Guide

This guide is for vendor staff (implementation consultants and support engineers) who set up and look after a customer's tenant once it has been provisioned. It covers how you get into a tenant, the onboarding order, roles and users, the audit log, sensitive data, troubleshooting, and how self-hosted installs differ. Platform-console work (provisioning, plans and seats, feature overrides, billing, opening support sessions) is in the [Platform Operations Guide](platform-operations-guide.md). Day-to-day screen help for the customer's own staff is in the [User Guide](../user-guide/index.md). Everything below describes what the product actually does in this release. Where a task has no screen, the guide says so instead of describing a workaround that does not exist.

## 1. Concepts

### 1.1 Tenants and isolation

A tenant is one customer organisation. Every business table has a `tenant_id` column protected by Postgres row-level security (RLS). Each API request and background job runs in a transaction that sets the `app.tenant_id` setting, and the API connects as a database role that cannot bypass RLS. One tenant can never read another tenant's rows, even through a bug in a query.

How a request finds its tenant:

- **Before login** (the login page, `POST /api/v1/auth/login`, `GET /api/v1/public/tenant-context`), the API looks up the request's `Host` header in the `tenant_domain` table. In cloud mode (`DEPLOYMENT_MODE=cloud`), each customer has its own hostname, for example `acme.example.com`.
- **After login**, the tenant comes from the `tid` claim in the signed access token. The `Host` header is ignored from then on.
- **Self-hosted** (`DEPLOYMENT_MODE=self-hosted`) has exactly one tenant, `DEFAULT_TENANT_SLUG` (default `default`). Every hostname resolves to it, so no `tenant_domain` row is needed. See [Self-hosted differences](#9-self-hosted-differences).

### 1.2 The tenant super-admin

Provisioning creates one **tenant super-admin**. Its username and email are both the `admin_email` given at provisioning, and it gets a random temporary password that is shown once in the platform console. A super-admin:

- bypasses every permission check (but not module entitlements, see 1.4);
- is the only kind of user who can see **Admin & Access** (ผู้ดูแล & สิทธิ์). The whole menu is gated to super-admins in the web app, even if a role grants `iam.*` codes;
- counts as one seat.

> **Note:** No screen or API can create another super-admin or remove the flag. `POST /api/v1/users` has no super-admin field. Treat the provisioned account as the customer's master account and agree at handover who will hold it.

### 1.3 Permission model

Access is granted through **roles**. A role is a named set of permission codes in the form `module.resource.action`, taken from the fixed catalogue in `packages/contracts/src/permissions/catalog.ts`. A user can hold several roles, and their effective permissions are the union of those roles. Customers cannot add codes to the catalogue.

| Module | Codes |
|---|---|
| HR & Payroll | `hr.employee.view`, `hr.employee.manage`, `hr.ot.approve`, `hr.payroll.approve`, `hr.payslip.view`, `hr.salary.view`, `hr.salary.edit` |
| Admin (IAM) | `iam.user.manage`, `iam.role.manage`, `iam.audit.view`, `iam.user.force_logout` |
| Inventory | `inventory.product.create`, `inventory.receipt.manage`, `inventory.issue.manage`, `inventory.adjustment.approve`, `inventory.cost.view` |
| Production | `production.wo.manage`, `production.scan`, `production.subcontract.manage` |
| Reports | `report.inventory.view`, `report.sales.view`, `report.cost.view`, `report.profit.view`, `report.tax.view`, `report.schedule.manage` |
| Sales | `sales.customer.manage`, `sales.quotation.manage`, `sales.invoice.create`, `sales.invoice.approve`, `sales.payment.record`, `sales.document.void`, `sales.etax.submit` |

The API checks permissions on every endpoint. The web app hides what a user cannot use: a module or sub-menu item appears only if the user holds at least one of the codes it needs. Items the user cannot use are **absent** from the sidebar, mobile tab bar, drawer and command palette. They are never shown greyed out.

### 1.4 Entitlements (plan module gating)

A tenant's plan decides which modules it may use. The five gated modules are `hr`, `inventory`, `production`, `sales` and `reporting`, each switched on by a feature key such as `module.hr`. The value comes from the tenant's `tenant_feature` override if one exists, otherwise from the plan default, otherwise off. Admin (IAM) is never gated. Every plan in the standard catalogue switches all five modules on. Platform staff take a module away by adding a `tenant_feature` override (see the [Platform Operations Guide](platform-operations-guide.md)).

Entitlement is checked before permission, and **super-admins do not bypass it**:

- **In the UI:** the module and all its sub-items are missing from navigation for everyone, the super-admin included.
- **In the API:** calls return 403 with the message `Module not included in this organization's plan: <module>`.

The web app reads the tenant's entitled modules from `GET /api/v1/auth/me` when a session starts. After platform staff change entitlements, users must reload or sign in again to see the change.

### 1.5 Seats

Each plan includes a number of seats: WORKSHOP 8, FACTORY 20, MULTISITE 40, SELFHOSTED 20. Platform staff can add extra seats on top. The cap is `included_seats + extra_seats`.

A user **occupies a seat** when all of the following are true:

- the user is not deleted;
- the user's status is `ACTIVE` or `PENDING`;
- the user's effective permissions are **not** a subset of `production.scan`.

So these accounts are **free and unlimited**:

- floor accounts whose roles grant only `production.scan`;
- users with no roles at all.

Disabled users never count.

Any change that would put a new person into a counted seat is checked against the cap: creating a user, changing a user's roles, re-enabling a user, editing a role's permissions, or importing permissions. If the change would take the tenant over the cap, it is refused with **422** and nothing is saved. Changes that do not add a counted seat, such as disabling users, still work in a tenant that is already over its cap.

> **Note:** There is no seat-usage screen. The counts appear only in the "Seat limit reached" (จำนวนที่นั่งเต็มแล้ว) alert when a change is refused. The API `GET /api/v1/iam/seats` (needs `iam.user.manage`) returns `included_seats`, `extra_seats`, `counted` and `exempt` if you need to check before a bulk load.

### 1.6 Tenant statuses

The tenant status (`TenantStatus`) is set by platform staff or by the billing dunning sweep. It is enforced centrally by the API for every request.

| Status | What works | What users see |
|---|---|---|
| `ACTIVE` | Everything. | Normal app. While the subscription is in its grace period, a grace banner shows the renewal deadline. |
| `READ_ONLY` | All reads (records, reports, payroll and payslips, audit log, PDF renders). The only writes allowed are login, refresh, logout, report export and the tenant PDPA export. Every other write returns 403 `TENANT_READ_ONLY`. | After the first refused save: a persistent banner ("This workspace is read-only because its subscription needs renewing…") and a "Change not saved" toast on each refused save. |
| `SUSPENDED` | Nothing. Every request is refused with 403, login included. | The message "This organization's account is suspended. Please contact your vendor to restore access." comes back from the API. The login screen itself only shows "Incorrect username or password." |
| `PURGING` | Nothing (same as `SUSPENDED`). The tenant is being deleted. | Same as `SUSPENDED`. |

> **Note:** The web app has no endpoint that reports tenant status. It learns that the tenant is read-only only when a save is refused, so the read-only banner does not show until someone tries to save something.

## 2. Gaining access to a tenant

### 2.1 As the tenant super-admin (handover)

During initial setup you will usually work as the tenant super-admin, either with the customer present or with their written agreement.

1. Get the hostname and the one-time temporary password from whoever provisioned the tenant. Pass the password only over a secure channel.
2. Open `https://<tenant-host>/login`. The login page asks for the tenant's name from `GET /api/v1/public/tenant-context`. If the host is not mapped, that request fails and sign-in is refused.
3. Sign in. The username is the admin email address.

> **Warning:** **Users cannot change their own password.** There is no change-password screen or endpoint, so the temporary password stays in use until engineering resets it (see [5.4](#54-passwords-lockout-and-unlocking)). The README says to "change the password" at first login, but that step cannot be done in this release. Agree with the customer how the credential is kept, and hand it to the customer's named owner at go-live.

### 2.2 Via a platform support session

After handover, get into a customer's tenant only through a **support session**. A platform admin opens one in the platform console (**Support sessions**, เซสชันซัพพอร์ต). It requires:

- a **reason** (mandatory);
- a scope: `READ_ONLY` or `FULL`;
- a time box: the default is `SUPPORT_SESSION_DEFAULT_MINUTES` (60) and the maximum is `SUPPORT_SESSION_MAX_MINUTES` (240).

See the [Platform Operations Guide](platform-operations-guide.md#7-support-sessions) for the procedure.

How a support session behaves:

- **Super-admin rights, with limits:** while it lasts, you act as a tenant super-admin. A `READ_ONLY` session is held to the read-only rules even when the tenant is `ACTIVE`. Module entitlements still apply.
- **Short-lived token:** the session issues one access token, shown only once. There is no refresh token. When the session expires or is ended early, the token stops working on its next request.
- **Recorded in both ledgers:** opening and ending the session, and every audited action during it, are written to the platform audit log and to the tenant's own audit log.
- **Visible to the customer:** in the tenant's **Audit log** (ประวัติการตรวจสอบ), support entries have `actor_role = platform_support` and a `support_session_id`. The Actor column shows the platform admin's ID, which does not match any of the tenant's users. Session open and close appear as `CREATE` / `UPDATE` on entity type `support_session`, with your reason in the Reason column.

> **Warning:** The web app cannot use a support-session token yet. There is no "enter tenant" button, and the tenant login screen only accepts a username and password. Use the token as `Authorization: Bearer <token>` against the API (`/api/v1/...`) for diagnosis and fixes. Never ask the customer for their super-admin password instead. That would bypass the audit trail the support session exists to provide.

## 3. Onboarding checklist for a new tenant

Work through these steps in order. Later steps depend on data created in earlier ones.

### 3.1 What provisioning already seeded

Provisioning runs `seedTenantDefaults` (`packages/db/src/seed/tenant-defaults.ts`) for every new tenant:

| Seeded item | Default values | Editable in the UI? |
|---|---|---|
| Document sequences | `EMPLOYEE` EXT0001, `ITEM` AA00001, `QUOTATION_VAT` QV{yyyy}0001, `QUOTATION_NONVAT` QNV{yyyy}0001, `INVOICE` INV{yyyy}0001, `WORK_ORDER` WO{yyyy}0001, `RECEIPT` RE{yyyy}0001 | No screen yet. Prefixes and formats are fixed at provisioning. |
| Units of measure | `PCS`, `KG`, `M`, `ROLL` | No screen yet. You cannot add UoMs or list their IDs from the UI. |
| Warehouse | "Main Warehouse" | No screen yet. You cannot add a second warehouse. |
| Tax brackets | Illustrative progressive bands from 0% to 25%, effective 2024-01-01 | No screen yet. |
| SSO (social security) config | 5% of wage, wage floor 1,650, ceiling 15,000 | No screen yet. |
| OT rates | Weekday 1.5x, holiday 1.0x, holiday 3.0x | No screen yet. |
| Cash-advance policy | Up to 50% of base salary, at most 3 instalments | No screen yet. |
| Document template | "Default" (empty layout) | Not persisted. See 3.3. |
| Roles | None | Yes. See [section 4](#4-roles-and-permissions). |

> **Warning:** The payroll defaults (tax brackets, SSO, OT rates, advance policy) are **illustrative and not authoritative**. Have the customer's accountant confirm them before the first payroll run. Any change today needs an engineering database change. Raise a ticket with the confirmed values and effective date. There is no screen for this.

### 3.2 Step 1: First login

1. Sign in as the tenant super-admin (see [2.1](#21-as-the-tenant-super-admin-handover)).
2. Check that the expected modules appear in the sidebar. If one is missing, it is an entitlement issue (see [Troubleshooting](#8-troubleshooting)).
3. Switch language from the top bar if needed (Thai is the default).

### 3.3 Step 2: Company and document settings, templates

- **Company profile (legal name, tax ID, address):** no screen yet, and there is no company-settings record in the API. Invoice exports currently show the document number and lines without a company letterhead.
- **Document templates:** **Sales → Templates** (การขาย → เทมเพลต) opens the "Document templates" designer. You can upload a logo, signature and stamp and map Excel named ranges, and the sample preview updates live. However, **nothing on this screen is saved**. It is a client-side workbench until the API gets template endpoints, and generated PDFs do not use these assets yet. Do not tell customers their branding is configured.

### 3.4 Step 3: PromptPay

PromptPay QR codes on invoices credit the `PROMPTPAY_ID` environment variable, which is set **once for the whole deployment**.

- **Cloud:** every tenant's QR pays the same account. Do not promise customer-specific PromptPay in cloud until per-tenant settings ship.
- **Self-hosted:** the customer's IT sets `PROMPTPAY_ID` to the customer's own mobile number or tax ID.

If `PROMPTPAY_ID` is not set, requesting a QR returns 422.

### 3.5 Step 4: Warehouses and units of measure

Use the seeded "Main Warehouse" and the four base UoMs. Two screens ask for raw IDs instead of offering a picker:

- **Inventory → Items** (คลังสินค้า → รายการสินค้า) asks for a "Base UOM ID";
- goods receipts ask for a "Receiving UOM ID".

There is no UoM or warehouse list endpoint. Get the UUIDs for the tenant's `uom` and `warehouse` rows from engineering and give them to the customer's inventory lead. Per-item conversions between UoMs are created through `POST /api/v1/uom-conversions`. There is no dedicated screen for them.

### 3.6 Step 5: Item catalogue

1. Open **Inventory → Items** (คลังสินค้า → รายการสินค้า). This needs `inventory.product.create`.
2. Click **Create item**. Enter the name, type (Raw / Finished / Consumable), Base UOM ID, costing method (Moving average / FIFO / Standard), standard cost and minimum stock.
3. Item codes come from the `ITEM` sequence (AA00001 onwards).

### 3.7 Step 6: HR org structure

1. Open **HR & Payroll → Org structure** (บุคคล & เงินเดือน → โครงสร้างองค์กร). Viewing needs `hr.employee.view` or `hr.employee.manage`. Changes need `hr.employee.manage`.
2. Create **departments** first. A department can have a parent department.
3. Then create **positions**. Every position belongs to a department.

You cannot delete a department that still has positions, or a position that still has employees. Department, position and reporting-line changes are audited.

### 3.8 Step 7: Employees

1. Open **HR & Payroll → Employees** (บุคคล & เงินเดือน → พนักงาน) and click **Create employee**. Enter the first and last name, national ID, employment type (Monthly / Daily), position, hire date and probation end date.
2. On the employee page, use the **Salary** tab to add the base salary with an effective date. This needs `hr.salary.edit`.
3. Use the **Reporting** tab to set each employee's manager.

> **Note:** The **Create user** form has no employee field, so a login account cannot be linked to an employee record from the UI. The API accepts `employee_id` on `POST /api/v1/users`. Self-service features that depend on the link, such as an employee opening their own payslip, need that API call or an engineering fix.

### 3.9 Step 8: Payroll configuration

Payroll uses the seeded tax brackets, SSO config, OT rates and advance policy (see 3.1). **No screen yet.** Get the accountant's sign-off on the values and raise any changes with engineering before the first **HR & Payroll → Payroll** (บุคคล & เงินเดือน → เงินเดือน) run.

### 3.10 Step 9: Report schedules

1. Open **Reports → Report schedules** (รายงาน → ตารางส่งรายงาน) at `/reports/schedules`. This needs `report.schedule.manage`.
2. Create a schedule: name, report, frequency (Every day / Weekly, plus day of week), time, recipients and format.
3. Click **Run now** to test delivery.

Digests are sent by email through the deployment's `SMTP_*` settings. In cloud, these are the vendor's settings. If the mail server is unreachable, the send fails and raises an in-app alert after retries.

### 3.11 Step 10: Roles and users

Create roles first (see [section 4](#4-roles-and-permissions)), then users (see [section 5](#5-users)). Before starting, check the seat count (see 1.5) so a bulk load is not stopped halfway by the cap.

## 4. Roles and permissions

All role screens are under **Admin & Access → Roles** (ผู้ดูแล & สิทธิ์ → บทบาท) at `/admin/roles`, and are visible to super-admins only. The API needs `iam.role.manage`.

### 4.1 Create a role

1. Click **Create role**.
2. Enter a name (unique within the tenant) and an optional description.
3. Optionally choose **Start from template** (เริ่มจากเทมเพลต) to pre-tick a saved permission set.
4. Tick permissions in the matrix. The salary and cost codes (`hr.salary.*`, `inventory.cost.*`) sit in a separate group captioned "Salary & cost visibility" so they are never granted by accident.
5. Optionally click **Save as template** to reuse this set later.
6. Click **Create role**.

### 4.2 Clone a role

From the roles list or a role's page, choose **Clone** and enter a new name. The clone copies the source role's description and exact permission set. Clone a role to make a variant, for example "Sales staff (no void)", instead of re-ticking everything.

### 4.3 Edit a role

Open the role, change permissions, and click **Save changes**. A confirmation shows how many users the change affects.

> **Warning:** Saving a permission change **signs out every user who holds the role**. Their tokens are revoked at once, and their next action returns them to the sign-in screen with "Your access changed. Please sign in again." Renaming a role or editing only its description does not sign anyone out. Make permission edits outside shift hours, or warn the users first. A permission edit is also checked against the seat cap, because it can turn scan-only users into counted seats.

### 4.4 Delete a role

Choose **Delete**, then enter **your own password** to confirm. The server verifies it; a wrong password is refused with 403 and nothing changes. Deletion is also refused when:

- **users still hold the role** (409). The dialog shows how many and links to Users. Remove the role from those users first, then delete again;
- the role is a **system role** (badge "System role"). No system roles are seeded today.

### 4.5 Permission templates

A template is a named permission set used to start new roles. You create one with **Save as template** in the create-role drawer, or with `POST /api/v1/role-templates`. Templates can be listed and applied, but **not edited or deleted** in this release. Name them carefully.

### 4.6 Recommended role bundles

These are the eight business roles from the [UAT plan](../uat/UAT_PLAN.md). They are a sensible starting point for most customers. Create each as a role, or as a template first.

| Business role | Permission bundle | Notes |
|---|---|---|
| Owner / GM | `report.inventory.view`, `report.sales.view`, `report.cost.view`, `report.profit.view`, `report.tax.view`, `hr.payroll.approve`, `hr.ot.approve` | Add `inventory.cost.view` if they need the cost and profit reports. Those reports also require it (see 7.3). |
| Accountant | `sales.customer.manage`, `sales.quotation.manage`, `sales.invoice.create`, `sales.invoice.approve`, `sales.payment.record`, `sales.document.void`, `hr.payroll.approve`, `hr.salary.view`, `report.sales.view`, `report.tax.view`, `report.cost.view` | Holds salary visibility. |
| Sales staff | `sales.customer.manage`, `sales.quotation.manage`, `sales.invoice.create`, `sales.payment.record`, `report.sales.view` | |
| Warehouse staff | `inventory.product.create`, `inventory.receipt.manage`, `inventory.issue.manage`, `inventory.adjustment.approve`, `report.inventory.view` | Deliberately leaves out `inventory.cost.view`, so costs stay masked. |
| Production lead | `production.wo.manage`, `production.subcontract.manage` | |
| Floor operator | `production.scan` only | Free seat. Opens the locked-down scan kiosk with no navigation. |
| HR officer | `hr.employee.manage`, `hr.employee.view`, `hr.ot.approve`, `hr.salary.view`, `hr.salary.edit`, `hr.payslip.view` | |
| Super Admin / IT | The provisioned tenant super-admin | Not a role. Cannot be created (see 1.2). |

> **Tip:** Granting `iam.*` codes to a role does not give a non-super-admin any admin screens, because the whole **Admin & Access** menu is super-admin only. Leave `iam.*` out of business roles.

### 4.7 Permission import

**Admin & Access → Import** (ผู้ดูแล & สิทธิ์ → นำเข้าข้อมูล) at `/admin/import` bulk-loads roles from a spreadsheet (`POST /api/v1/iam/import`, multipart, needs `iam.role.manage`).

File format, using the first worksheet:

| Column A | Column B |
|---|---|
| Role name | Permission codes, separated by spaces, commas or semicolons |

- An optional first row whose column A reads `role`, `role name`, `role_name` or `name` is treated as a header and skipped.
- Fully empty rows are ignored.
- A row with codes but no role name is **skipped** and reported with "Missing role name". It does not stop the import.
- If **any** row contains a code that is not in the catalogue, the **whole import fails** (400). Each offending row and code is listed, and nothing is saved.
- Roles are matched by name within the tenant. A new name creates a role. **An existing role's permissions are replaced, not merged.** A row with a role name and an empty column B leaves that role with no permissions.
- Users who hold any re-imported role are signed out, and the seat cap applies to the whole import as one change.

Example:

| A | B |
|---|---|
| role_name | permission_codes |
| Sales staff | sales.customer.manage sales.quotation.manage sales.invoice.create sales.payment.record report.sales.view |
| Floor operator | production.scan |

> **Warning:** There is **no dry run**. Choosing a file validates and applies it in one step, and the row review shown afterwards is a report of what happened. Test the file on a non-production tenant first.

> **Note:** The import screen accepts `.xlsx` only. The API also accepts `.csv`; it detects the format from the file contents. In a CSV, commas separate columns, so separate the codes in column B with spaces or semicolons, or quote the cell.

## 5. Users

User screens are under **Admin & Access → Users** (ผู้ดูแล & สิทธิ์ → ผู้ใช้งาน) at `/admin/users`. The API needs `iam.user.manage`.

### 5.1 Create a user

1. Click **Create user**.
2. Enter a username (unique within the tenant), email, roles and a **Temporary password** (รหัสผ่านชั่วคราว).
3. Click **Create user**. The account is created `ACTIVE` and can sign in at once.

> **Warning:** The system does not enforce password strength; any non-empty value is accepted. The user also cannot change the password afterwards. Generate a strong random password for every account, send it securely, and never reuse a pattern across users. Never use the dev seed default in a real tenant.

If the new user would take a counted seat over the cap, creation is refused with **422** and the "Seat limit reached" alert lists who would have taken a seat. To fix it, do one of the following:

- disable an unused account;
- create the user with scan-only or no roles;
- ask platform staff to add seats or upgrade the plan.

**What promotes a scan-only user into a counted seat:** any change that leaves the user holding a permission other than `production.scan`. That means assigning them a second role, or adding a permission to a role they already hold (including through import). That change is the one that gets refused when the tenant is full.

### 5.2 Change roles, disable and re-enable

Open a user (`/admin/users/{id}`):

- **Roles:** change them and click **Save roles**. The user is signed out at once so the new permissions take effect.
- **Account status** (สถานะบัญชี): choose Active / Pending / Disabled, then click **Save status**.
  - **Disabled:** the user is refused on their next request and cannot sign in. Disabled users do not count as seats.
  - **Active:** re-enabling a disabled user is checked against the seat cap.
  - **Pending:** a pending user **cannot sign in but still counts as a seat**. Avoid this status.

There is no delete-user function. Retire accounts by disabling them.

### 5.3 Force logout

On the user page, under **Sessions**, click **Force logout** (บังคับออกจากระบบ). This needs `iam.user.force_logout`. It revokes every live session of the user, and their next action returns them to sign-in. The account stays active, so they can sign in again straight away. To keep them out, disable the account as well.

> **Note:** The force-logout dialog asks for your password, but the server does not check it for this action in this release. Do not treat the prompt as a security control. The **Sessions** list shows only the most recent sign-in, not each device.

### 5.4 Passwords, lockout and unlocking

- **Lockout:** five consecutive wrong passwords lock the account for 15 minutes. These values are fixed in code and cannot be configured. While the account is locked, the correct password is also refused. The failure counter resets only after a **successful** sign-in. If the user gets it wrong again after the lock expires, the account locks again immediately.
- **Unlock:** there is no unlock button or endpoint. Either wait out the 15 minutes or escalate to engineering.
- **Forgotten password / reset:** no "forgot password" flow, no admin reset, and no self-service change. A super-admin cannot set a new password for an existing user. The only supported way to resolve it is an engineering ticket. Do not create a duplicate account as a workaround, because it uses another seat and splits the audit history.
- **Google sign-in:** if platform staff have turned on the `auth.google` feature for the tenant, **existing** users can also sign in with Google. It never creates accounts.

> **Warning:** Do not test lockout on the super-admin account. A lockout blocks all administration for 15 minutes.

## 6. Audit log

Open **Admin & Access → Audit log** (ผู้ดูแล & สิทธิ์ → ประวัติการตรวจสอบ) at `/admin/audit`. The API (`GET /api/v1/audit`) needs `iam.audit.view`. The log is append-only and nothing on the screen can change it.

**What is recorded:**

- **Access and roles:** successful sign-ins (`LOGIN`); user creation, role assignment and status changes (`PERMISSION_CHANGE`, entity `user`); force logouts (`FORCE_LOGOUT`); role create, edit, clone, delete and import (entity `role`); permission templates (`role_template`).
- **HR structure:** departments, positions and reporting lines.
- **Business actions:** invoice voids (with the void reason), stock adjustments and work-order completion.
- **Support sessions:** session open and close, and every audited action taken during a session (see 2.2).

Failed sign-ins are not audited. They only increase the lockout counter.

**Filters:**

- Entity type: free text such as `role` or `user`.
- Actor user ID: a user's UUID.
- From / To dates, applied to the whole day in UTC.

Each row shows time, actor (raw user ID, or "System"), action, entity and reason; **Show details** expands a before/after diff of the changed fields. A user's page has an **Activity** section with entries about that user.

> **Tip:** The Actor column shows a UUID, not a name. To find a user's ID, open the user from the Users list; the ID is in the page URL `/admin/users/{id}`.

## 7. Data sensitivity

### 7.1 National ID (PII encryption)

Employee national IDs are encrypted at rest with AES-256-GCM using the deployment's `ENCRYPTION_KEY`. The API will not start without a valid key. The decrypted value is returned only to users with `hr.salary.view` and to super-admins. Everyone else gets responses with the field left out entirely. Payslip PDFs are password-protected with the employee's national ID.

> **Warning:** Losing or changing `ENCRYPTION_KEY` makes every stored national ID unreadable, and payslip passwords depend on it too. Self-hosted customers must back the key up with their database backups.

### 7.2 Salary masking (`hr.salary.view`)

Without `hr.salary.view` (and not a super-admin), the API removes `base_salary` and `national_id` from employee records, and `gross`, `net` and the breakdown from payslips. The fields are left out of the response, not blanked. Changing salary needs `hr.salary.edit` as a separate grant. Give these codes only to HR and payroll staff.

### 7.3 Cost masking (`inventory.cost.view`)

Without `inventory.cost.view`:

- cost columns in inventory reports and screens are blank;
- the dedicated cost endpoints return 403;
- **cost and profit** reports and dashboards return 403 even with `report.cost.view` or `report.profit.view`, because those reports require both codes. Grant `inventory.cost.view` together with them.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Incorrect username or password." for every user on a new host | The hostname has no `tenant_domain` row (cloud). Login is refused with the same error as a bad password, so hostnames cannot be probed. | Check the exact host, including subdomain and any proxy rewriting. The proxy must pass the original `Host` header. There is no API to add a hostname to an existing tenant; ask engineering to insert the `tenant_domain` row. |
| One user gets "Incorrect username or password." with the right password | The account is locked, disabled or pending. The login screen shows the same message for all of these. | Check the status on the user page. Re-enable the account, or wait 15 minutes for the lock to expire (see 5.4). |
| Nobody can sign in, and the API says the account is suspended | The tenant is `SUSPENDED` or `PURGING`. | Platform action. See the [Platform Operations Guide](platform-operations-guide.md). |
| A module is missing for **everyone**, super-admin included | The module is not entitled for the tenant. | Platform staff add a `module.<name>` override or change the plan. Users then reload. |
| A module or menu item is missing for **one user** | The user holds none of the permissions that item needs. | Grant a role with the permission (see [4.6](#46-recommended-role-bundles)). |
| User creation, role assignment or a role edit refused with "Seat limit reached" (422) | The change would push the counted seats over the cap. | Disable unused accounts, use scan-only roles for floor staff, or have platform staff add seats. |
| Saves fail with "Change not saved" and a read-only banner | The tenant is `READ_ONLY` (unpaid renewal), or you are in a `READ_ONLY` support session. | The customer pays the renewal invoice and platform staff mark it paid. Reads and exports keep working meanwhile. |
| Users kicked to sign-in with "Your access changed. Please sign in again." | A role they hold had its permissions edited or re-imported, their own roles changed, or someone forced a logout. | Expected. They sign in again. Schedule role edits to avoid disrupting shifts. |
| PromptPay QR fails with 422 | `PROMPTPAY_ID` is not set for the deployment. | Set the environment variable (self-hosted), or raise it with operations (cloud). |
| Invoice/payslip PDF or barcode labels never arrive, or the export job completes with no file | A known issue: several workers compete on the shared `pdf` queue, and a job taken by the wrong worker finishes without doing anything. Storage (`S3_*`) or Chromium faults are less likely causes. | Retry the export. If it keeps failing, escalate to engineering with the job ID and time. Check the API/worker logs for storage or renderer errors. |
| Report digests not received | SMTP is unreachable or misconfigured. | Check `SMTP_*`. In-app alerts appear after retries are exhausted. Use **Run now** to test. |
| "Base UOM ID" or warehouse ID unknown when creating items or receipts | There is no UoM or warehouse list in the UI. | Get the seeded IDs from engineering (see 3.5). |
| Role cannot be deleted | Users still hold it (409), or the password was wrong (403). | Remove the role from those users, then delete again with your own password. |

## 9. Self-hosted differences

A self-hosted install runs the same build with `DEPLOYMENT_MODE=self-hosted` and exactly one tenant.

- **One tenant, any hostname:** every host maps to the `DEFAULT_TENANT_SLUG` tenant, so `tenant_domain` rows are not needed and the "unmapped host" problem cannot happen. The tenant is created at boot or by the migration, and its defaults are seeded the same way as in cloud (see 3.1).
- **Super-admin:** the database seed creates the tenant super-admin, username `superadmin`, with the password from `SEED_SUPERADMIN_PASSWORD` set when the seed runs. If that variable is not set, the dev default `changeme` is used.

  > **Warning:** That default is for development only. Always pass a strong `SEED_SUPERADMIN_PASSWORD` when seeding a customer install. Because users cannot change passwords, the seed value is the long-term credential.

- **No platform console:** `/platform/*` is not mounted. As a result:
  - there are no support sessions, so vendor staff work on-site or remotely as the customer's super-admin, with the customer's consent;
  - there are no feature overrides or plan changes from a UI;
  - there is no billing or dunning, so the tenant does not go `READ_ONLY` for non-payment.
- **Seats still apply:** the seed gives the default tenant the FACTORY plan (20 seats). The SELFHOSTED plan, also 20 seats, exists in the catalogue. Changing the plan or extra seats needs a database change by engineering.
- **Customer-owned settings:** the customer's IT sets `PROMPTPAY_ID` (their own account), `SMTP_*`, `S3_*`, and keeps `ENCRYPTION_KEY` and the JWT secrets safe and backed up.
- **Everything inside the tenant** (onboarding, roles, users, audit log, data masking) works exactly as described in sections 3 to 7.
