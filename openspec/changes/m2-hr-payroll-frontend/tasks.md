# M2 — HR & Payroll (Frontend): Tasks

> Applies after `m0-frontend-foundation` + backend `m2-hr-payroll`. UI-only; consumes the `hr`
> contract via `@ts-rest/react-query`. Salary masking throughout.

## 1. Deps, routes & i18n

- [ ] 1.1 Register `hr` routes with metadata + required `Permission`: `/hr/employees(/{id})`,
  `/hr/ot`, `/hr/advances`, `/hr/attendance`, `/hr/payroll(/runs/{id})`, `/hr/tax-exports`
- [ ] 1.2 Add the `hr` i18next namespace (TH+EN); nav + ⌘K entries from route metadata

## 2. Data layer

- [ ] 2.1 `hr` query/mutation hooks (employees, ot, advances, attendance, payroll runs, payslips,
  exports) with invalidation; job-status polling for payslip PDF + PND.1/SSO

## 3. Module components

- [ ] 3.1 **PayrollWizard** stepper (Inputs/Calculate/Review/Approve) + missing-data gate
- [ ] 3.2 **PayslipBreakdownDrawer** (formula line-by-line, read-only, masked)
- [ ] 3.3 **CashAdvanceApprovalCard** (mobile, ceiling-check badge, re-auth)
- [ ] 3.4 **AttendanceMonthGrid**; **CeilingCheckBadge**; **DocumentVaultRow** (signed-URL)

## 4. Screens / flows

- [ ] 4.1 `employee-management-ui` — employees list + tabbed detail (salary masked, secure docs),
  create/edit (MD4)
- [ ] 4.2 `payroll-run-ui` — run list + wizard (MD1) + payslip breakdown drawer (MD2) + guarded
  approve (`hr.payroll.approve`)
- [ ] 4.3 `approvals-ui` — OT approval queue + detail; mobile cash-advance approval with re-auth (MD3)
- [ ] 4.4 `attendance-ui` — import + monthly grid
- [ ] 4.5 `tax-exports-ui` — PND.1 / SSO async export (job-toast → download) (MD5)

## 5. i18n, a11y & Storybook

- [ ] 5.1 TH+EN strings for `hr`; BE/CE dates on payslips and periods
- [ ] 5.2 WCAG AA: wizard stepper focus order, masked-field lock semantics, chips not color-only,
  one-hand mobile approval targets
- [ ] 5.3 Stories: PayrollWizard, PayslipBreakdownDrawer, CashAdvanceApprovalCard at theme×density×locale

## 6. Verification

- [ ] 6.1 `pnpm --filter @erp/web build && typecheck && lint` green; Storybook renders
- [ ] 6.2 Salary fields masked without `hr.salary.view` (layout stable); routes gated by permission
- [ ] 6.3 Drive: payroll run → missing-data gate → calculate (job) → review (outlier flagged) →
  approve (guarded) → payslip drawer shows full formula; cash-advance approved one-handed with re-auth
