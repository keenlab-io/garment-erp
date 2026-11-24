# HR & Payroll

This chapter is for the HR officer who keeps employee records and runs payroll, the payroll approver (usually the owner, general manager or accountant), and the system administrator who approves cash advances. It covers the whole month in order: setting up the org structure, onboarding employees, protecting personal data, loading attendance, handling overtime and cash advances, running and approving payroll, payslips, the PND.1 and SSO exports, and probation reminders.

Everything here lives under **HR & Payroll** (บุคคล & เงินเดือน) in the main menu. The sub-menu shows only the screens your role allows.

| Screen | Thai label | What it is for |
|---|---|---|
| **Employees** | พนักงาน | The employee register and each employee's record |
| **Org structure** | โครงสร้างองค์กร | Departments and positions |
| **OT requests** | คำขอ OT | Raising, approving and reconciling overtime |
| **Cash advances** | เบิกเงินล่วงหน้า | Approving or rejecting advance requests |
| **Attendance** | การเข้างาน | Importing clock data and viewing the monthly grid |
| **Payroll** | เงินเดือน | Creating, calculating and approving monthly payroll runs |
| **Tax exports** | ส่งออกภาษี | Producing the PND.1 and social security (SSO) files |

## Setting up the org structure

Create departments and positions before you onboard staff. Every position belongs to one department.

### Create a department

1. Open **HR & Payroll → Org structure**.
2. In the **Departments** section, click **New department**.
3. Enter the **Name**, for example "Production".
4. To make it a sub-department, choose a **Parent department**, for example "Sewing line" under "Production". Leave it empty for a top-level department.
5. Click **Save changes**. The message "Department created." confirms it.

### Create a position

1. In the **Positions** section, click **New position**.
2. Enter the **Title**, for example "Sewing operator".
3. Choose the **Department** it belongs to.
4. Optionally add a **Job description**.
5. Click **Save changes**. The message "Position created." confirms it.

> **Note:** If no department exists yet, the screen shows "Create a department first — every position belongs to one." and offers **Create a department first**.

### Correct or remove a department or position

1. On the row, open the row actions and choose **Edit**. The form opens already filled in with the current values.
2. Change the name, parent department, title, department or job description.
3. Click **Save changes**.

Moving a position to another department does not affect the employees who hold it. They stay in that position.

To remove a row, choose **Delete** and confirm. The system refuses the delete if anything still depends on the row:

- A department cannot be deleted while it still has positions or sub-departments. Move them first.
- A position cannot be deleted while an employee still holds it. Move those employees to another position first.

> **Note:** A deleted department or position is hidden, not erased, so old records that mention it still read correctly. There is no "restore". If you delete one by mistake, create it again.

**Who can do this:** staff whose role allows managing employees (`hr.employee.manage`). Staff with view-only HR access can see the structure but not change it.

## Onboarding a new employee

### Create the employee record

1. Open **HR & Payroll → Employees**.
2. Click **Create employee**.
3. Fill in **First name** and **Last name**.
4. Enter the **National ID** (13 digits). This is optional but recommended, because it is also used to protect the employee's payslip file (see [Payslips](#payslips)).
5. Choose the **Employment type**: **Monthly** for salaried staff or **Daily** for daily-wage workers.
6. Choose the **Position**.
7. Enter the **Hire date**.
8. If the employee is on probation, enter the **Probation end date**.
9. Click **Create employee**.

The system gives the employee an employee code automatically and adds them to the register.

### Record the base salary

Payroll cannot pay an employee who has no salary on file. Add the salary straight after creating the record.

1. In the register, open the row actions on the new employee and choose **View details**.
2. Open the **Salary** tab.
3. Enter the **New base salary**. For a daily-wage worker, enter the daily rate.
4. Enter the **Effective date**.
5. Click **Add salary record**. The message "Salary record added." confirms it, and **Current salary** updates.

For a pay rise later, add a new salary record with the date the rise takes effect. Earlier records are kept as history.

**Who can do this:** creating employees needs employee management (`hr.employee.manage`). Adding salary records also needs salary editing (`hr.salary.edit`).

### The rest of the employee record

| Tab | What you can do |
|---|---|
| **Profile** | View the national ID, employment type, position, hire date and probation end date. Click **Edit** to change name, employment type or position, then **Save**. |
| **Documents** | Choose a **Document type** (**ID card**, **Contract**, **Certificate** or **Other**) and click **Upload document**. Stored files can be fetched again with **Download**. |
| **Salary** | Current salary and **Add salary record**. |
| **Pay components** | Not yet available. It shows "Pay components aren't available yet." |
| **Reporting** | The employee's **Manager** and **Direct reports**. Click **Change manager**, pick a person (or **No manager**) and click **Save**. |

> **Note:** The manager list on the Reporting tab shows roughly the first 100 employees. In a large factory, the person you need may not appear in the list.

### Employee statuses

| Status | Meaning |
|---|---|
| **Probation** | Newly hired. Every new employee starts here. Included in payroll. |
| **Active** | A confirmed employee. Included in payroll. |
| **Suspended** | Temporarily stopped. Not included in payroll. |
| **Resigned** | Has left. Not included in payroll. |

Use the status filter above the register to list only one status.

> **Warning:** There is currently no button to change an employee's status, for example to confirm them as Active after probation or mark them Resigned. A resigned employee who is still in Probation or Active will be included in the next payroll run unless you exclude them in that run's **Inputs** step. Contact support to have a status changed.

## Protecting personal and pay data

The system treats salaries and national ID numbers as confidential.

- Only staff whose role includes salary visibility (`hr.salary.view`) see real money figures and national ID numbers.
- Everyone else sees a lock symbol and dots in the same place. This applies to the salary column in the register, the employee's current salary and national ID, cash-advance amounts, payroll net amounts and totals, and the payslip breakdown.
- The figures are never sent to the screens of staff without salary visibility, so they cannot be uncovered.
- National ID numbers are stored encrypted.

> **Tip:** When you design roles, give salary visibility only to the people who really need it, such as the HR officer and the accountant. In the permission matrix, salary and cost visibility are set apart under their own heading so they are not granted by accident. See [Admin & Access](06-admin-access.md#roles-and-permissions).

## Importing attendance

Attendance drives overtime reconciliation, so import each month's clock data before you reconcile overtime or run payroll.

### Prepare the file

Use an Excel (.xlsx) or CSV file with one row per employee per day and these four columns, in this order:

| Column | Content |
|---|---|
| emp_code | The employee code shown in the register |
| work_date | The day worked |
| clock_in | Clock-in time (leave blank if absent) |
| clock_out | Clock-out time (leave blank if absent) |

A header row is allowed. Ask support for a sample file if your time-clock export needs converting.

### Import and review

1. Open **HR & Payroll → Attendance**.
2. Set **Period** to the month you are importing.
3. Click **Import attendance** and choose the file.
4. Check the message "Imported N attendance row(s)." The count should match the number of rows in your file.
5. Review the monthly grid. There is one row per employee and one column per day.

| Grid mark | Meaning |
|---|---|
| **Present** | The day has a clock-in or clock-out time |
| **Absent** | The day is in the file but has no times |
| **No record** | The day is not in any imported file |
| **Leave** / **Holiday** | Shown in the legend, but the import cannot record them yet |

> **Warning:** If any employee code in the file is not recognised, the whole file is refused and nothing is imported. Correct the code and import again. Importing the same employee and day again replaces the earlier record.

**Who can do this:** staff with employee management (`hr.employee.manage`).

## Overtime requests and approval

Overtime goes through four stages. The status column on screen uses these labels:

| Stage | Status shown | What happens next |
|---|---|---|
| Submitted | **Pending** | Waiting for an approver |
| Approved | **Approved** | Waiting to be reconciled against attendance |
| Reconciled | **Posted** | Payable hours are fixed and the request goes into payroll |

### Raise an OT request

1. Open **HR & Payroll → OT requests**. The page is titled **OT approvals**.
2. Click **New OT request**.
3. Choose the **Employee**.
4. Enter the **Work date**, **Start time** and **End time**.
5. Choose the **Rate type**: **Weekday (1.5×)**, **Holiday (1.0×)** or **Holiday (3.0×)**.
6. Enter a **Reason**, for example "Rush order for customer PO 2411".
7. Click **Submit for approval**. The request appears in the list as **Pending**.

> **Note:** In the list and detail view, the rate type appears as a short code, for example WEEKDAY_1_5 for the weekday 1.5× rate.

### Approve a request

1. In the list, open the row actions and choose **View** to check the date, time, rate and reason.
2. Click **Approve**. The message "OT request approved." confirms it, and the status changes to **Approved**.

### Reconcile against attendance

Reconciling sets the hours the company will actually pay. The system pays whichever is smaller: the hours requested, or the hours between clock-in and clock-out on that day's attendance.

1. Make sure attendance for the work date has been imported.
2. On an **Approved** request, open the row actions and choose **Reconcile**.
3. Check **Approved hours** and confirm the status is now **Posted**.

For example, someone asks for 17:00–20:00 (3 hours), but attendance shows only 2 hours for the day. Reconciling sets approved hours to 2, and payroll pays 2 hours.

> **Warning:** Reconcile only after that day's attendance is imported. If the day has no attendance, or is missing a clock-in or clock-out, approved hours are set to 0 and the employee is paid no overtime for it. A reconciled request cannot be reopened.

> **Note:** Two current limitations. First, OT requests cannot be rejected on screen. Only approve and reconcile exist, so agree off-screen not to proceed with a request you would refuse, and do not reconcile it. Second, "hours attended" is the whole span from clock-in to clock-out on that day, not just the overtime window.

**Who can do this:** opening the screen and approving or reconciling needs OT approval (`hr.ot.approve`). Raising a request also needs employee management (`hr.employee.manage`).

## Cash advances

Under the company's default policy, an advance can be up to 50% of the employee's base salary and repaid over up to 3 instalments. A request above the limit is refused when it is submitted.

### Approve or reject a request

1. Open **HR & Payroll → Cash advances**. Each pending request is shown as a card with the employee's name, the **Amount**, the **Reason** and a limit indicator: **Within ceiling**, **Approaching ceiling** or **Over ceiling**.
2. To approve, click **Approve**, read the confirmation, enter your password when asked, and confirm. The message "Cash advance approved." confirms it.
3. To reject, click **Reject**, type a reason (the dialog will not continue without one), and confirm. The message "Cash advance rejected." confirms it.

> **Note:** Only the system administrator account (Super-Admin) can approve a cash advance. Other users see the button greyed out with the hint "Requires Super-Admin". HR staff can still reject.

> **Note:** Current limitations. There is no screen to raise a new cash-advance request, and no screen to record that the cash has been handed over. Payroll deducts an advance only after it has been recorded as handed over, so an advance that is only approved on screen will not yet be deducted from pay. The rejection reason you type is not kept on the request. Ask support for help with raising and handing over advances.

**Who can do this:** viewing and rejecting needs employee management (`hr.employee.manage`). Amounts are visible only with salary visibility (`hr.salary.view`).

## Running monthly payroll

Payroll is done month by month. Each run moves through four steps, **Inputs → Calculate → Review → Approve**, shown across the top of the run.

| Run status | Shown as | Meaning |
|---|---|---|
| Draft | **Draft** | Created, not calculated yet |
| Calculated | **In Progress** | Payslips calculated and ready to review |
| Approved | **Approved** | Locked and final. Payslips are produced. |

### Before you start

- Every employee to be paid has a base salary on file.
- Attendance for the month is imported.
- Every approved OT request for the month is reconciled.

### Create the run

1. Open **HR & Payroll → Payroll**.
2. In **New run period**, type the month as year-month, for example 2026-10.
3. Click **Create run**. The message "Payroll run 2026-10 created." confirms it.
4. In the list, open the row actions on the new run and choose **Open**.

### Step 1 — Inputs

The Inputs step lists everyone who will be paid (all Probation and Active employees) and warns about anything that would make the figures wrong:

- **Missing salary**: the employee has no salary record.
- **Unreconciled OT**: the employee has approved overtime that has not been reconciled.

1. Fix each flagged employee, for example by adding the salary or reconciling the overtime, or tick **Exclude** to leave them out of this run.
2. When the screen says "No missing data — ready to calculate.", click **Continue to calculate**.

While anyone is still flagged, the screen says "Resolve or exclude the flagged employees before calculating." and you cannot continue.

### Step 2 — Calculate

1. Click **Run calculation**. The button shows **Calculating…** while the system works through every payslip in the background.
2. When the payslips are ready, click **Continue to review**.

### Step 3 — Review

1. Check each employee's **Net** amount. A row marked **Outlier** has a net of zero or less, or a net more than double the base salary. Check those first.
2. Click **View breakdown** to open a payslip. It lists **Base salary**, **Overtime**, **Social security**, **Withholding tax**, **Cash-advance repayment** and **Net**, with deductions shown in brackets.
3. When everything is correct, click **Continue to approve**.

### Step 4 — Approve

1. Read the summary: the number of payslips and the **Net total**.
2. Click **Approve payroll**.
3. Read the confirmation. It says approving locks the run, pulls outstanding advances into deductions, and generates payslips.
4. Click **Approve payroll** to confirm. The message "Payroll run approved." confirms it, and the run shows **Approved**.

A run can be approved only once. If you try again, the system shows "Couldn't approve this payroll run — it may already be approved." and nothing changes.

> **Warning:** Approval is final. Re-check the Review step before approving, especially outliers and anyone you excluded.

**Who can do this:** the **Payroll** and **Tax exports** screens need payroll approval (`hr.payroll.approve`). Seeing net amounts and breakdowns also needs salary visibility (`hr.salary.view`). Without it, amounts show as locked.

### How the figures are worked out

The system's default payroll settings follow standard Thai rules. They are a starting point and should be confirmed by your accountant.

| Line | How it is calculated by default |
|---|---|
| Base salary | The salary on file on the last day of the period |
| Overtime | Approved hours × hourly rate × rate multiplier. Hourly rate for monthly staff = base salary ÷ 208 (26 days × 8 hours). For daily staff = daily rate ÷ 8. |
| Social security | 5% of base salary, with the wage counted between ฿1,650 and ฿15,000, so at most ฿750 a month |
| Withholding tax | Base salary × 12, taxed on the progressive scale (0% to ฿150,000, then 5%, 10%, 15%, 20%, up to 25% above ฿1,000,000), divided by 12 |
| Cash-advance repayment | Added at approval, for advances that have been handed over |
| Net | Base + overtime − social security − tax − advance repayment |

**Worked example.** Ms. Suda Jaidee is a monthly employee on ฿30,000. She has 2 reconciled weekday overtime hours.

| Line | Calculation | Amount (THB) |
|---|---|---|
| Base salary | | 30,000.00 |
| Overtime | 2 h × (30,000 ÷ 208 = 144.2308) × 1.5 | 432.69 |
| Social security | 5% × 15,000 (capped) | (750.00) |
| Withholding tax | 360,000 a year: 5% × 150,000 + 10% × 60,000 = 13,500 ÷ 12 | (1,125.00) |
| **Net** | | **28,557.69** |

> **Warning:** Check these points with your accountant before relying on the figures. Withholding tax is worked out from base salary only. It does not take personal allowances, expense deductions or overtime into account. For **Daily** employees, the base line is the recorded daily rate as entered. It is not multiplied by the days worked. Review daily-wage payslips carefully.

> **Note:** In the Inputs step, the list of employees shows the first page of the register only. In a large factory, some employees may not appear there to exclude, but they are still paid if they are Probation or Active.

## Payslips

When a run is approved, the system produces a PDF payslip for every employee in it. To protect privacy, each PDF is locked with a password. The password is the employee's 13-digit national ID, or their employee code if no national ID is on file. Tell employees this when you hand out payslips.

Until then, the breakdown in the Review step (**View breakdown**) is the on-screen record of each payslip.

> **Note:** Current limitation: there is no download button for payslip PDFs on the screens yet, and payslips are not yet sent to employees by email or LINE. Contact support if you need the PDF files for a run.

**Who can see payslips:** staff with payslip access (`hr.payslip.view`), and each employee for their own payslip.

## Tax exports (PND.1 and SSO)

After a month's payroll is approved, produce the files for the Revenue Department (PND.1) and the Social Security Office (SSO).

1. Open **HR & Payroll → Tax exports**.
2. Read the notice. These exports run in the background, and their figures are not official, so confirm them with your accountant.
3. Set **Period** to the approved month.
4. Click **Export PND.1**. A message "Generating PND1 export…" appears, then "PND1 export started" with "You'll be notified when the file is ready."
5. Click **Export SSO**. The same messages appear for SSO.

If something goes wrong, the message reads "PND1 export failed" or "SSO export failed". Check that the period is right and try again.

> **Note:** Current limitation: the screen confirms that the export has been accepted, but there is no download link or "file ready" notice in the app yet. Ask support to send you the produced files. Always have your accountant check the figures before filing.

**Who can do this:** staff with payroll approval (`hr.payroll.approve`).

## Probation reminders

When you enter a **Probation end date** for an employee who is still on **Probation**, their record shows a banner such as "Probation ends 30 Nov 2026." Use it to plan the probation review.

Each night the system also checks for probation periods ending in the next 30 days.

> **Note:** Current limitation: these nightly reminders do not yet appear in the notification bell or by email. Until they do, filter the register by **Probation** and check end dates regularly. Confirming someone after probation currently needs support, because there is no status-change button (see [Employee statuses](#employee-statuses)).

## Related chapters

- [Getting started](00-getting-started.md#signing-in) for signing in and finding your way around.
- [Reports](05-reports.md) for the owner's dashboards.
- [Admin & Access](06-admin-access.md) for setting up an HR officer role and controlling salary visibility.
