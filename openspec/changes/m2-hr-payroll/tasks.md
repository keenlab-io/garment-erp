# M2 — HR & Payroll: Tasks

> Sequenced **after M1** (depends on M1 roles/permissions, audit, `is_super_admin`, and the
> `user.employeeId` column).

## 1. Contracts — `packages/contracts/src`

- [x] 1.1 Add `enums/hr.ts` — `employment_type` (`DAILY|MONTHLY`), `employee_status`
  (`PROBATION|ACTIVE|RESIGNED|SUSPENDED`), `ot_request_status`, `cash_advance_status`,
  `payroll_run_status` (spec §2.3), plus `employee_document.type`, `pay_component.type`
  (`ALLOWANCE|DEDUCTION`), and repayment `mode` (`LUMP|INSTALLMENT`)
- [x] 1.2 Add `dto/hr.ts` — `hrContract` router (`pathPrefix: API_PREFIX`, `withErrors`):
  employees + org (`GET/POST /employees`, `GET/PUT /employees/{id}` with `ifMatchHeader`,
  `POST /employees/{id}/documents`, `POST /employees/{id}/salary`, departments/positions),
  OT (`create`/`submit`/`approve`/`reconcile`), cash-advances (`create`/`approve`/`disburse`),
  `POST /attendance/import`, payroll (`POST /payroll-runs`, `/{id}/calculate` → `jobAccepted`,
  `GET /{id}/payslips`, `/{id}/approve`), `GET /payslips/{id}/pdf` (302), exports
  (`pnd1`/`sso` → `jobAccepted`), and config CRUD. Model salary/monetary fields **optional**
  for gating; lists via `paginationQuery` + `paginated`
- [x] 1.3 Register `hr: hrContract` on the root `contract` in `dto/index.ts`; export new
  DTO types from the package barrel
- [x] 1.4 (If adopting finer permission codes per design OQ3) extend the `PERMISSIONS`
  catalog; otherwise map management actions to existing `hr.employee.manage` /
  `hr.payroll.approve`
- [x] 1.5 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 2. DB schema — `packages/db/src`

- [x] 2.1 Add HR enums to `schema/enums.ts` mirroring `enums/hr.ts` (keep the `expectTypeOf`
  parity test green)
- [x] 2.2 Add `schema/hr/org.ts` — `department` (self-FK `parent_id`), `position`
  (`department_id` FK)
- [x] 2.3 Add `schema/hr/employee.ts` — `employee` (`emp_code` unique, `national_id_enc`
  bytea, `profile` jsonb, `position_id` FK, `employment_type`, `status` default PROBATION,
  `hire_date`, `probation_end_date`, audit + `version`), `reporting_line`
  (PK `employee_id`, `manager_employee_id` self-FK), `employee_document`
- [x] 2.4 Add `schema/hr/compensation.ts` — `salary_record`, `pay_component`,
  `employee_pay_component` (PK `(employee_id, pay_component_id)`) using `money()`
- [x] 2.5 Add `schema/hr/time.ts` — `ot_request`, `attendance` (PK `(employee_id, work_date)`)
- [x] 2.6 Add `schema/hr/cash-advance.ts` — `cash_advance` (`repayment_plan` jsonb,
  `outstanding` money, `version`)
- [x] 2.7 Add `schema/hr/payroll.ts` — `payroll_run` (`unique(period)`, `version`), `payslip`
  (`breakdown` jsonb, `unique(run_id, employee_id)`, `pdf_key`)
- [x] 2.8 Add `schema/hr/config.ts` — effective-dated `tax_bracket`, `sso_config`, `ot_rate`
  (multiplier per `rate_type`), `advance_policy`
- [x] 2.9 Add the `user.employeeId → employee(id)` FK constraint to `platform/users.ts`
  (M1 added the bare column)
- [x] 2.10 Re-export `schema/hr/*` from `schema/index.ts`; `pnpm db:generate` and review
- [x] 2.11 Adjust the seeded `EMPLOYEE` `document_sequence` row → `includeYear:false`,
  `format:"{prefix}{seq:0000}"` (renders `EXT0001`); seed default config rows (tax/SSO/OT/advance)
- [ ] 2.12 `pnpm db:migrate && pnpm db:seed` against dev Postgres; confirm tables + FK + seeds

## 3. Cross-cutting infra — `apps/api/src`

- [x] 3.1 Add `ENCRYPTION_KEY` (32-byte) to `config/env.schema.ts` (fail-fast) and to
  docker-compose/devcontainer env
- [x] 3.2 Implement `common/crypto/` — AES-256-GCM `encrypt(plain) → Buffer` /
  `decrypt(buf) → string` using Node `crypto`; ciphertext = `iv‖tag‖ct`
- [x] 3.3 Implement `common/` salary-gating projection helper — omit monetary keys when
  `!user.isSuperAdmin && !user.permissions.has('hr.salary.view')` (delete keys, never null)
- [x] 3.4 Add `qpdf` to `.devcontainer/Dockerfile` (apt) and note the prod image; add
  `node-qpdf2` to `apps/api` deps
- [x] 3.5 Add BullMQ producer/worker plumbing — first `@InjectQueue` producers; `@Processor`
  workers extending `BaseWorker`; a **repeatable** job upserted at module init for probation alerts

## 4. Nest module — `apps/api/src/hr`

- [x] 4.1 `EmployeeService` — create (issue `emp_code` via SequenceService, PII-encrypt
  national ID/bank fields, emit `EmployeeCreated`), get/list (apply salary-gating), update
  (`If-Match`), documents (StorageService), org (dept/position/reporting-line)
- [x] 4.2 `CompensationService` — salary history (current = latest effective ≤ today),
  pay components / employee overrides
- [x] 4.3 `OtService` — lifecycle + reconcile (`approved_hours = min(requested, attended)`),
  OT pay = `approved_hours × hourly_rate × rate_multiplier`, emit `OTApproved`
- [x] 4.4 `CashAdvanceService` — submit (ceiling check → 422), approve (`is_super_admin`),
  disburse (`outstanding = amount`), emit `CashAdvanceApproved`/`CashAdvanceDisbursed`
- [x] 4.5 `AttendanceService` — Excel/CSV import upserting `(employee, work_date)`
- [x] 4.6 `PayrollService` + calculate worker — enqueue calculate (202 `job_id`), build
  payslips + snapshot `breakdown`, net formula via `@erp/utils` decimals (to the cent),
  idempotent on `run_id`; `approve` pulls advances + decrements `outstanding` (→ CLEARED),
  409 on double-approve, recalc only DRAFT/CALCULATED; emit `PayrollApproved`
- [x] 4.7 `PayslipService` + payslip PDF `@Processor('pdf')` worker — render (PdfService) →
  encrypt (qpdf) → store (StorageService) → set `pdf_key` → emit `PayslipGenerated`; download
  returns 302 signed URL (self or `hr.payslip.view`)
- [x] 4.8 `ExportService` — PND.1 / SSO async export jobs (non-authoritative)
- [x] 4.9 `PayrollConfigService` — effective-dated config read + admin CRUD
- [x] 4.10 Probation worker — daily scan for `probation_end_date` within N days → `ProbationEnding`
- [x] 4.11 ts-rest `HrController`(s) — `@TsRestHandler(contract.hr)`; in-handler
  `assertPermissions(user, "hr.…")`; wrap mutations in `uow.withTransaction`; `HrModule`
  imports Storage/Pdf/Queue; wire into `app.module.ts`
- [x] 4.12 Verify: `pnpm build && pnpm typecheck && pnpm lint` green; API boots and maps the
  new `/api/v1` HR routes

## 5. Tests (spec §2.8 + PII)

- [x] 5.1 OT requested 3h, attendance 2h ⇒ reconcile sets `approved_hours=2`, pay reflects 2h
- [x] 5.2 Approved run auto-inserts each employee's outstanding advance into deductions;
  `net` equals the formula **to the cent**; advance `outstanding` decremented (→ CLEARED at 0)
- [x] 5.3 A user lacking `hr.salary.view` gets employee records with monetary fields
  **omitted** (absent, not nulled-then-shown); a holder sees them
- [x] 5.4 Approving a payroll run twice ⇒ second call 409; recalc after APPROVED ⇒ 409
- [ ] 5.5 Payslip `GET /pdf` returns an expiring signed URL; opening the PDF requires the
  configured password; unauthorized caller ⇒ 403
- [x] 5.6 PII: national ID stored as ciphertext (round-trips to plaintext via the helper);
  boot fails without a valid `ENCRYPTION_KEY`
- [x] 5.7 Cash advance over ceiling ⇒ 422; non-super-admin approve ⇒ 403

## 6. Verification

- [x] 6.1 `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green from the repo root
- [ ] 6.2 `pnpm db:generate` clean after migration; `pnpm db:migrate && pnpm db:seed` run
  cleanly against a fresh DB (tables, `user.employeeId` FK, config seeds present)
- [ ] 6.3 Boot `pnpm dev` and drive end-to-end: create employee (emp_code `EXT0001`, PII
  encrypted) → set salary → import attendance → OT request/approve/reconcile → create run →
  calculate (202 job) → approve (advance pulled, net to the cent) → generate + download an
  encrypted payslip
