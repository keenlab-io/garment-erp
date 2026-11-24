# Admin & Access

This chapter is for the factory's own system administrator, the person who decides who can sign in to Garment ERP and what each person can see and do. It covers creating and disabling user accounts, building roles from permissions, importing permissions from a spreadsheet, reading the audit log, account lockout, the seat limit on your plan, and what happens when you ask support for help.

Everything here lives under **Admin & Access** (ผู้ดูแล & สิทธิ์), at the bottom of the main menu.

| Screen | Thai label | What it is for |
|---|---|---|
| **Users** | ผู้ใช้งาน | Accounts: create, assign roles, disable, force sign-out |
| **Roles** | บทบาท | Bundles of permissions you assign to users |
| **Audit log** | ประวัติการตรวจสอบ | A permanent record of who did what, and when |
| **Import** | นำเข้าข้อมูล | Loading roles and permissions from an Excel file |

> **Note:** **Admin & Access** is shown only to the factory's super-administrator account, the account you received when the system was set up. Other users never see it, even if their role includes administration permissions. The super-administrator can also do everything else in the system, so keep its password safe and do not use it for day-to-day work.

## How access works

- A **permission** allows one kind of action, for example approving payroll or recording a payment.
- A **role** is a named bundle of permissions, for example "HR Officer".
- A **user** is one person's sign-in. You give each user one or more roles, and they can do everything any of their roles allows.

Menus and buttons a user is not allowed to use are hidden from them. They do not appear greyed out. Salary and cost figures are a special case. Without salary or cost visibility, a user still sees the screen, but the figures show a lock symbol and dots instead of numbers.

The system starts with only the super-administrator account and no roles. Before anyone else can work, create the roles you need (see [Recommended roles](#recommended-roles-for-a-garment-factory)) and then the users.

## Users

### Create a user

1. Open **Admin & Access → Users**.
2. Click **Create user**.
3. Enter a **Username**. This is what the person types to sign in, for example "somsri.hr".
4. Enter their **Email**.
5. Under **Roles**, pick one or more roles.
6. Enter a **Temporary password**.
7. Click **Create user**.

The new account is active straight away. Give the username and temporary password to the person privately, and point them to [Getting started](00-getting-started.md#signing-in).

> **Warning:** People cannot change their own password in the system yet, and there is no "reset password" button. The temporary password you set stays their password. Choose a strong one, hand it over privately, and contact support if a password needs to be changed.

> **Note:** If your plan has no free seats, the form shows **Seat limit reached** instead of creating the account. See [Seat limit](#seat-limit).

### Find and review users

The **Users** list shows **Username**, **Email**, **Status**, **Roles** and **Last login** ("Never" if the person has not signed in yet). Use the status filter to show only **Active**, **Pending** or **Disabled** accounts.

To open a user, choose **View details** from the row actions. The user page has four sections:

| Section | What you can do |
|---|---|
| **Roles** | Change the user's roles and click **Save roles** |
| **Account status** | Change the status and click **Save status** |
| **Sessions** | See the user's most recent sign-in, and **Force logout** |
| **Activity** | The audit log entries for this user |

### Change a user's roles

1. Open the user with **View details**.
2. Under **Roles**, add or remove roles.
3. Click **Save roles**.

Anyone whose roles change is signed out at once. The next time they sign in, they see "Your access changed. Please sign in again." and get their new access.

### Disable an account

When someone leaves, or must be stopped from signing in, disable their account. Accounts cannot be deleted, so disabling is how you retire them. Their history stays in the audit log.

1. Open the user with **View details**.
2. Under **Account status**, choose **Disabled**.
3. Click **Save status**.

A disabled user cannot sign in, and if they are signed in now, they lose access on their next action. To let them back in, set the status to **Active** again.

| Status | Meaning |
|---|---|
| **Active** | Can sign in and work |
| **Pending** | Cannot sign in yet |
| **Disabled** | Cannot sign in. Use this for staff who have left. |

### Force a user to sign out

Use this if a device is lost or you suspect someone else is using an account.

1. Open the user with **View details**.
2. Under **Sessions**, click **Force logout**.
3. Read the confirmation. It says this immediately revokes every active session for the user.
4. Enter your own password and confirm.

The user is signed out on every device at once. They can sign in again with their password, so if you think the password is known to someone else, also disable the account and contact support.

## Roles and permissions

### Create a role

1. Open **Admin & Access → Roles**.
2. Click **Create role**.
3. Enter a **Name**, for example "Warehouse Staff", and optionally a **Description**.
4. To start from a saved template, choose it under **Start from template**. Its permissions are ticked for you. Leave it at **None** to start empty.
5. In the permission matrix, tick the permissions the role needs (see [Using the permission matrix](#using-the-permission-matrix)).
6. Optionally click **Save as template**, type a **Template name** and confirm, so you can reuse this set of permissions later.
7. Click **Create role**.

### Using the permission matrix

The matrix groups permissions by area: hr, iam (administration), inventory, production, report and sales. Each area has a row for each kind of record and a column for each action. Click an area's heading to collapse or expand it.

Salary and cost visibility are set apart below the grid with the caption "Salary & cost visibility — grant these separately to avoid accidental over-exposure." Tick them only for people who truly need to see pay or cost figures.

What each permission allows:

| Area | Permission | Allows |
|---|---|---|
| HR | `hr.employee.view` | View employee records and the org structure |
| HR | `hr.employee.manage` | Create and edit employees, org structure, attendance, OT requests; view and reject cash advances |
| HR | `hr.ot.approve` | Open the OT screen, approve and reconcile overtime |
| HR | `hr.payroll.approve` | Run, calculate and approve payroll; tax exports |
| HR | `hr.payslip.view` | View any employee's payslip |
| HR (special) | `hr.salary.view` | See salaries, national ID numbers and all payroll amounts |
| HR (special) | `hr.salary.edit` | Add salary records |
| Inventory | `inventory.product.create` | Items and barcodes |
| Inventory | `inventory.receipt.manage` | Goods receipts |
| Inventory | `inventory.issue.manage` | Issuing stock, stock counts |
| Inventory | `inventory.adjustment.approve` | Approve stock adjustments |
| Inventory (special) | `inventory.cost.view` | See item costs, and cost and profit report figures |
| Production | `production.wo.manage` | Timeline, work orders, WIP board |
| Production | `production.scan` | The floor scan station only |
| Production | `production.subcontract.manage` | Subcontracts |
| Sales | `sales.customer.manage` | Customers |
| Sales | `sales.quotation.manage` | Quotations |
| Sales | `sales.invoice.create` | Create invoices |
| Sales | `sales.invoice.approve` | Approve invoices |
| Sales | `sales.payment.record` | Record payments |
| Sales | `sales.document.void` | Void sales documents |
| Sales | `sales.etax.submit` | e-Tax submission |
| Reports | `report.inventory.view`, `report.sales.view`, `report.tax.view` | The matching dashboards and reports |
| Reports | `report.cost.view`, `report.profit.view` | Cost and profit dashboards (also need `inventory.cost.view`) |
| Reports | `report.schedule.manage` | Emailed report schedules |
| Administration | `iam.user.manage`, `iam.role.manage`, `iam.audit.view`, `iam.user.force_logout` | Administration tasks. The **Admin & Access** menu itself is only for the super-administrator. |

### Change a role

1. In **Roles**, choose **Edit** from the row actions on the role.
2. Tick or untick permissions in the matrix. Above the matrix, a notice says how many active users the change will affect.
3. Click **Save changes**.
4. Read the confirmation, "Save role changes?". It says how many active users will be affected and that they will be signed out.
5. Confirm.

**What happens to signed-in users:** everyone who holds the role is signed out straight away. When they sign in again, they see "Your access changed. Please sign in again." and get the new permissions. Make role changes outside busy hours, or warn people first, so nobody loses unsaved work.

> **Note:** Roles marked **System role** cannot be deleted and must keep at least one permission.

### Clone a role

Cloning is the quickest way to make a similar role, for example a "Senior Sales" role based on "Sales Staff".

1. In **Roles**, choose **Clone** from the row actions. You can also click **Clone** on the role's page.
2. Enter the **New role name**.
3. Click **Clone role**.
4. Open the new role and adjust its permissions.

### Delete a role

1. In **Roles**, choose **Delete** from the row actions. You can also click **Delete** on the role's page.
2. Read the confirmation. It says the role will be permanently deleted.
3. Enter your own password and confirm.

You cannot delete a role while anyone still has it. The system shows, for example, "2 user(s) still use this role — reassign them from Users, then delete again." Click **Go to Users**, give those people another role, then delete again.

## Importing permissions from a file

If you prefer to plan roles in a spreadsheet, you can load them in one go.

### Prepare the file

Use an Excel (.xlsx) file:

| Column A | Column B |
|---|---|
| Role name, for example "Sales Staff" | Permission codes separated by commas, spaces or semicolons, for example `sales.customer.manage, sales.quotation.manage, report.sales.view` |

A header row (for example "role_name" and "permission_codes") is allowed.

### Import the file

1. Open **Admin & Access → Import**.
2. Drag the file onto **Drop an Excel file here**, or click **Browse files** and choose it.
3. Read the review table. Each row shows **Row**, **Status** (**OK** or **Error**) and a **Reason**.
4. If all is well, the screen confirms "Imported N role(s)."
5. If there are errors, correct the file, click **Fix & re-upload** and choose the corrected file.

What the import does:

- A role name that does not exist yet creates a new role.
- A role name that already exists has its permissions **replaced** by exactly those in the file. Permissions not listed are removed from that role.
- Roles not mentioned in the file are left alone.
- If any row has a permission code the system does not recognise, nothing at all is imported. Fix the code and upload again.
- A row with codes but no role name is skipped and reported.

> **Warning:** Because an import replaces the permissions of existing roles, everyone holding those roles is signed out, just as when you change a role by hand. Importing the same file twice is safe.

## The audit log

The audit log is a permanent record of important actions: sign-ins, permission and role changes, forced sign-outs, approvals, voided documents, and record changes. Entries cannot be edited or deleted.

### Search the log

1. Open **Admin & Access → Audit log**.
2. Narrow the list with the filters:
   - **Entity type**: the kind of record, for example role or user.
   - **Actor user ID**: the internal ID of the user who acted.
   - **From** and **To**: a date range.
3. Read the columns **Time**, **Actor**, **Action**, **Entity** and **Reason**. Actions done automatically by the system show **System** as the actor.
4. Click **Show details** on an entry to see **Before** and **After** values side by side. Click **Hide details** to close it.
5. Use **Previous** and **Next** to page through.

| Action shown | Meaning |
|---|---|
| CREATE / UPDATE / DELETE | A record was added, changed or removed |
| LOGIN / LOGOUT | Someone signed in or out |
| PERMISSION_CHANGE | A role, a user's roles, a user's status, or an import changed someone's access |
| FORCE_LOGOUT | An administrator signed a user out |
| APPROVE / VOID | A sensitive approval or a voided document |

> **Tip:** To see everything one person did, open the user from **Users** and look at their **Activity** section. That is easier than filtering by user ID.

## Account lockout

To protect against password guessing, an account is locked for 15 minutes after five wrong passwords in a row. While it is locked, even the correct password is refused. After 15 minutes the person can sign in normally, and a successful sign-in resets the count.

> **Note:** The sign-in screen shows the same "Incorrect username or password." message for a locked account as for a wrong password. If someone is sure their password is right but cannot get in, ask them to wait 15 minutes and try again.

> **Tip:** Do not test lockout with the super-administrator account. If it gets locked, nobody can administer the system for 15 minutes.

## Seat limit

Your subscription includes a set number of user seats. When a change would need more seats than your plan has, it is not saved and the screen shows:

- **Seat limit reached**
- For example, "12 of 12 seats are in use, so this change can't be saved."
- **Would take a seat:** followed by the users concerned
- "Add seats or upgrade your plan to add more users."

The check runs whenever a change could add a counted user: creating a user, changing a user's roles or status, editing a role, or importing permissions.

**Free scan-only floor accounts.** A user whose only permission is the floor scan station (`production.scan`) does not take a seat. The message reminds you of this: "Scan-only floor accounts are free and aren't counted (N in use)." Create one scan-only account per floor operator or scan station at no extra cost. If you give a scan-only user any other permission, directly or by adding a permission to their role, they start taking a seat.

> **Tip:** To free a seat, disable an account that is no longer needed (see [Disable an account](#disable-an-account)). To add seats, contact your vendor.

## Contacting support

If something is wrong that you cannot fix from these screens, for example a password reset, an employee status change, or a missing tax export file, contact your vendor's support team through your usual support channel. Include the screen, what you did, and the time it happened.

If support needs to look inside your system, they open a support session:

- A support session must have a written reason, and is either read-only or allowed to make changes.
- It is time-limited, usually one hour and never more than four hours. When it ends, support's access ends with it.
- The start and end of every support session appear in your **Audit log** as "support_session" entries. Anything support does during the session is also recorded there.

> **Tip:** After a support visit, open the **Audit log**, set **Entity type** to support_session, and check when the session started and ended. Then review what was done.

## Recommended roles for a garment factory

Use these as a starting point. Create each role once, then assign it to users. They are based on the roles the system was tested with.

| Role | Who | Permissions |
|---|---|---|
| **Owner / GM** | Owner, general manager | All report areas (`report.inventory.view`, `report.sales.view`, `report.cost.view`, `report.profit.view`, `report.tax.view`), payroll approval (`hr.payroll.approve`), OT approval (`hr.ot.approve`). Add `inventory.cost.view` to see cost and profit figures, and `hr.salary.view` to see payroll amounts. |
| **Accountant** | Accounts staff | Customers, quotations, invoices, invoice approval, payments and voiding (`sales.customer.manage`, `sales.quotation.manage`, `sales.invoice.create`, `sales.invoice.approve`, `sales.payment.record`, `sales.document.void`), payroll approval and salary visibility (`hr.payroll.approve`, `hr.salary.view`), and sales, tax and cost reports (`report.sales.view`, `report.tax.view`, `report.cost.view`) |
| **Sales staff** | Sales and customer service | `sales.customer.manage`, `sales.quotation.manage`, `sales.invoice.create`, `sales.payment.record`, `report.sales.view` |
| **Warehouse staff** | Store keepers | `inventory.product.create`, `inventory.receipt.manage`, `inventory.issue.manage`, `inventory.adjustment.approve`, `report.inventory.view`. Leave out cost visibility so purchase costs stay private. |
| **Production lead** | Planners, line supervisors | `production.wo.manage`, `production.subcontract.manage` |
| **Floor operator** | Sewing and finishing operators, scan stations | `production.scan` only. Free, and sees nothing but the scan station. |
| **HR officer** | HR staff | `hr.employee.manage`, `hr.employee.view`, `hr.ot.approve`, `hr.salary.view`, `hr.salary.edit`, `hr.payslip.view` |
| **System administrator** | The super-administrator account | Already exists. No role needed. |

> **Note:** Some approvals are kept for the super-administrator account only, whatever roles are assigned. These include approving cash advances. So an owner who must approve cash advances does it signed in as the super-administrator. See [HR & Payroll](04-hr-payroll.md#cash-advances).

## Related chapters

- [Getting started](00-getting-started.md#signing-in) to send new users.
- [HR & Payroll](04-hr-payroll.md) for how salary visibility affects HR screens.
- [Reports](05-reports.md#who-sees-which-reports) for which permissions open which reports.
