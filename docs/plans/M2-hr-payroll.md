# M2 — HR & Payroll

Spec: [`../BACKEND_SPEC_M1-M6.md`](../BACKEND_SPEC_M1-M6.md) §2. Recipe & shared
primitives: [`README.md`](README.md), [`M0-foundation.md`](M0-foundation.md).

**Depends on:** M1 (users, audit, permissions), M0 (sequence, storage, pdf,
queue). Links `user.employee_id`.

Responsibilities: employee master & documents, org structure, salary history,
allowances/deductions, OT request→approval→reconciliation, cash advance with
auto-deduction, payroll run engine, encrypted e-payslips, Thai PND.1 + SSO inputs.

---

## 1. Contracts — `dto/hr.ts`

- Employees & org (`hr.employee.view`/`hr.employee.manage`; salary fields gated by
  `hr.salary.view`): `GET/POST /employees` (paginated; `emp_code` auto),
  `GET/PUT /employees/{id}` (`If-Match`), `POST /employees/{id}/documents`
  multipart, `POST /employees/{id}/salary` (`hr.salary.edit`), departments/
  positions CRUD.
- OT: `POST /ot-requests`, `/{id}/submit`, `/{id}/approve` (`hr.ot.approve`),
  `/{id}/reconcile` `{approved_hours?}`.
- Cash advance: `POST /cash-advances` (422 over ceiling), `/{id}/approve`
  (super-admin), `/{id}/disburse`.
- Attendance: `POST /attendance/import` multipart → `{rows_imported}`.
- Payroll: `POST /payroll-runs`, `/{id}/calculate` → 202 `jobAccepted`,
  `GET /{id}/payslips`, `/{id}/approve` (`hr.payroll.approve`),
  `GET /payslips/{id}/pdf` → 302 signed-url (self or `hr.payslip.view`),
  `GET /payroll/exports/pnd1` / `/sso` → 202.

Enums (`enums/hr.ts`): `employment_type`, `employee.status`, `ot_request.status`,
`cash_advance.status`, `payroll_run.status` (spec §2.3). Permissions in catalog.

---

## 2. DB schema — `packages/db/src/schema/hr/`

Spec §2.2: `department` (self-FK parent), `position`, `employee` (`emp_code`
unique; **encrypted PII** `national_id_enc bytea`; `profile jsonb` with sensitive
fields encrypted), `reporting_line`, `employee_document` (`file_key`),
`salary_record` (history), `pay_component`, `employee_pay_component`, `ot_request`,
`cash_advance` (`repayment_plan jsonb`, `outstanding`), `attendance`
(PK `(employee_id, work_date)`), `payroll_run` (`unique(period)`), `payslip`
(`breakdown jsonb`, `unique(run_id, employee_id)`, `pdf_key`). `money()`/`qty()`
helpers; encryption handled at the service layer (store ciphertext in `bytea`).

---

## 3. Nest module — `apps/api/src/hr/`

- Creating an employee emits `EmployeeCreated`; SequenceService issues `emp_code`
  (`EXT0001`).
- **OT pay** = `approved_hours × hourly_rate × rate_multiplier`;
  `approved_hours = min(requested, attended)` from `attendance` at reconcile.
- **Cash-advance ceiling** checked at SUBMIT (422 over limit); approval requires
  `is_super_admin`; on disburse `outstanding = amount`.
- **Payroll**: `calculate` runs as a BullMQ job; snapshots every input into
  immutable `payslip.breakdown`; `net = (base + Σallowances + ot) − (sso + tax +
  advance_repayment + Σother_deductions)` (canonical, to the cent). `approve` pulls
  outstanding advances into the deduction line and decrements
  `cash_advance.outstanding` (→ CLEARED at 0); **409 on double-approve**;
  re-calc only allowed while DRAFT/CALCULATED.
- **e-Payslip**: PDF via the `pdf` worker, encrypted per-employee, stored via
  `StorageService`; download returns a signed URL (self or `hr.payslip.view`).
- **Field-level gating**: omit monetary fields entirely (not nulled) without
  `hr.salary.view` (M0 helper / service projection).
- Probation alert: scheduled BullMQ job N days before `probation_end_date`.
- Emits `OTApproved`, `CashAdvanceApproved`/`Disbursed`, `PayrollApproved`,
  `PayslipGenerated`, `ProbationEnding`. Tax/SSO params configurable, flagged
  non-authoritative (spec §2.5).

---

## 4. Tests (spec §2.8)

- OT requested 3h, attendance 2h ⇒ reconcile sets `approved_hours=2`, pay = 2h.
- Approved run auto-inserts each employee's outstanding advance into deductions;
  `net` matches the formula to the cent; advance `outstanding` decremented.
- A user lacking `hr.salary.view` gets employee records with monetary fields
  omitted (not nulled-then-shown).
- Approving a run twice ⇒ second call 409.
- Payslip link is a signed URL that expires; opening requires the configured
  password.

Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`.
