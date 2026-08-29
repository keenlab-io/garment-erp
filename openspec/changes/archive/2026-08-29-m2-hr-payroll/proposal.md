# M2 — HR & Payroll

## Why

M2 gives the ERP its workforce: the employee master and org structure, salary history and
pay components, the OT and cash-advance lifecycles, attendance, the payroll-run engine,
encrypted e-payslips, and Thai statutory (PND.1 + social-security) export inputs. Nothing
in M0/M1 models an employee or computes pay — M1 only linked `user.employeeId` as a bare
column pointing at a table that does not exist yet. M2 creates that `employee` table, wires
the FK back from `user`, and builds every HR/payroll behavior on top of the M0 infra
(sequencing, storage, PDF, queue) and M1 authorization (`hr.*` permissions,
`is_super_admin`, audit).

M2 also introduces three capabilities the platform has never needed before: **symmetric
encryption of PII at rest** (national ID, bank details), **password-protected PDF
generation** (e-payslips), and **scheduled background work** (probation alerts) — each
built once here so later modules can reuse the pattern. The backend contract is
implementation-ready in `docs/BACKEND_SPEC_M1-M6.md` §2 and `docs/plans/M2-hr-payroll.md`;
this change captures it as spec-driven artifacts. Scope is **backend only**
(`@erp/contracts`, `@erp/db`, `apps/api`).

M2 depends on M1, which is currently an un-applied proposal — so this proposal is authored
now, but M2 **implementation must land after M1**.

## What Changes

- **Employee master & org**: `employee` (auto `emp_code` via SequenceService, emitting
  `EmployeeCreated`), `department`/`position`/`reporting_line`, and `employee_document`
  uploads stored via `StorageService` with signed-URL access. A **scheduled probation
  alert** notifies managers N days before `probation_end_date`.
- **PII protection**: national ID and sensitive `profile` bank fields are **encrypted at
  rest** (AES-256-GCM) at the service layer; decryption is server-side only and audited.
- **Compensation**: `salary_record` history (current = latest effective date ≤ today),
  `pay_component` + `employee_pay_component` (allowances/deductions), and **field-level
  gating** — monetary fields are **omitted entirely** (not nulled) for users without
  `hr.salary.view`.
- **Attendance**: Excel/CSV import into `attendance` (`{rows_imported}`), feeding OT
  reconciliation and payroll.
- **Overtime**: `ot_request` request→submit→approve→reconcile→paid, where reconcile sets
  `approved_hours = min(requested, attended)` and OT pay =
  `approved_hours × hourly_rate × rate_multiplier`.
- **Cash advance**: submit (ceiling check → 422 over limit), super-admin approve, disburse,
  and **auto-deduction** — an approved payroll run pulls outstanding advances into the
  deduction line and decrements `outstanding` (→ CLEARED).
- **Payroll run engine**: `payroll_run` per period; `calculate` runs as an **async job**
  (202 `{job_id}`) that snapshots every input into an immutable `payslip.breakdown`; the
  canonical **net formula** to the cent; `approve` is idempotent (**409 on double-approve**)
  and recalculation is allowed only while DRAFT/CALCULATED. Emits `PayrollApproved`.
- **e-Payslips**: per-employee **password-encrypted** PDFs (`qpdf`), rendered via
  `PdfService` in the `pdf` worker and stored via `StorageService`; downloaded through a
  signed URL by the employee (self) or `hr.payslip.view`. Emits `PayslipGenerated`.
- **Statutory exports**: PND.1 and SSO file exports as async jobs, explicitly
  **non-authoritative** (flagged for accountant confirmation).
- **Payroll configuration**: effective-dated DB config tables (tax brackets, SSO
  rate/ceiling, OT rate multipliers, cash-advance ceiling policy) the engine reads at
  calculation time.
- **Schema/seed housekeeping**: add the `user.employeeId → employee(id)` FK (M1 added the
  bare column); adjust the seeded EMPLOYEE `document_sequence` row so `emp_code` renders
  `EXT0001` (no year); add a new `ENCRYPTION_KEY` env var validated at boot.

No breaking changes (pre-release). The 7 `hr.*` permission codes already exist in the
`@erp/contracts` catalog.

## Capabilities

### New Capabilities

- `employee-management`: employee master, org structure (department/position/reporting
  line), documents, the auto `emp_code`, and the scheduled probation alert.
- `pii-protection`: AES-256-GCM encryption of national ID and bank fields at rest, with
  server-side-only, audited decryption.
- `compensation`: salary history and pay components, plus field-level omission of monetary
  fields for users lacking `hr.salary.view`.
- `attendance`: Excel/CSV attendance import keyed on `(employee, work_date)`.
- `overtime`: the OT request lifecycle and reconciliation to `min(requested, attended)`.
- `cash-advance`: the cash-advance lifecycle with ceiling enforcement, super-admin
  approval, and auto-deduction at payroll approval.
- `payroll`: the payroll-run engine — async calculate, immutable breakdown snapshot, the
  net formula, advance pull-in on approval, and PND.1/SSO export inputs.
- `e-payslip`: per-employee password-encrypted payslip PDFs with signed-URL download.
- `payroll-configuration`: effective-dated, admin-editable tax/SSO/OT/advance parameters,
  flagged non-authoritative.

### Modified Capabilities

None — M2 adds the `user.employeeId → employee(id)` FK and adjusts the EMPLOYEE seed via
migration/seed tasks, which are not spec-requirement changes to an existing capability.

## Impact

- **Packages**
  - `@erp/contracts` — new `enums/hr.ts` and `dto/hr.ts` (`hrContract`: employees+org, OT,
    cash-advance, attendance, payroll, payslips, exports, config), registered under a new
    `hr` key on the root `contract`; salary fields modeled optional to support gating.
  - `@erp/db` — new `schema/hr/` (13 spec tables) plus 4 effective-dated config tables; the
    `user.employeeId` FK; new HR enums in `schema/enums.ts` (parity-tested); the EMPLOYEE
    seed format adjusted; default config rows seeded.
  - `apps/api` — new `hr/` module (employee, compensation, OT, cash-advance, attendance,
    payroll, payslip, export, config services + payslip/probation workers) wired into
    `app.module.ts`; a `common/crypto/` AES helper; a `common/` salary-gating projection
    helper; the repo's first BullMQ producers and `@Processor` workers.
- **New runtime dependencies**: `node-qpdf2` (payslip PDF encryption). No new npm crypto
  dep for PII (Node's built-in `crypto`).
- **Infra**: add the `qpdf` apt package to `.devcontainer/Dockerfile` (and the prod image);
  add `ENCRYPTION_KEY` to the validated env (and docker-compose/devcontainer env). No new
  services — reuses Postgres/Redis/MinIO.
- **Downstream**: M3–M6 gain a reusable encryption helper, the first scheduled-job pattern,
  and the field-gating helper; `reporting_line.manager_employee_id` and payroll outputs
  feed M6 reporting. M2 implementation is sequenced **after M1**.
