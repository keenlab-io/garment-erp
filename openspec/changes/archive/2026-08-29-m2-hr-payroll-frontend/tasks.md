# M2 — HR & Payroll (Frontend): Tasks

> Applies after `m0-frontend-foundation` + backend `m2-hr-payroll`. UI-only; consumes the `hr`
> contract via `@ts-rest/react-query`. Salary masking throughout.

## 1. Deps, routes & i18n

- [x] 1.1 Register `hr` routes with metadata + required `Permission`: `/hr/employees(/{id})`,
  `/hr/ot`, `/hr/advances`, `/hr/attendance`, `/hr/payroll(/runs/{id})`, `/hr/tax-exports`
- [x] 1.2 Add the `hr` i18next namespace (TH+EN); nav + ⌘K entries from route metadata

## 2. Data layer

- [x] 2.1 `hr` query/mutation hooks (employees, ot, advances, attendance, payroll runs, payslips,
  exports) with invalidation; job-status polling for payslip PDF + PND.1/SSO

## 3. Module components

- [x] 3.1 **PayrollWizard** (Inputs/Calculate/Review/Approve + missing-data gate) — ⚠ built on a
  **local, bespoke stepper** instead of the shared `@erp/ui` **Wizard/Stepper** primitive: that
  primitive is owned by `m3-inventory-frontend` §3.3, which hasn't landed yet. Migrate
  `apps/web/src/hr/components/payroll-wizard.tsx`'s step header onto the shared primitive once
  M3 ships it.
- [x] 3.2 **PayslipBreakdownDrawer** (formula line-by-line, read-only, masked)
- [x] 3.3 **CashAdvanceApprovalCard** (mobile, ceiling-check badge, re-auth)
- [x] 3.4 **AttendanceMonthGrid**; **CeilingCheckBadge**; **DocumentVaultRow** (signed-URL)

## 4. Screens / flows

- [x] 4.1 `employee-management-ui` — employees list + tabbed detail (salary masked, secure docs),
  create/edit (MD4)
- [x] 4.2 `payroll-run-ui` — run list + wizard (MD1) + payslip breakdown drawer (MD2) + guarded
  approve (`hr.payroll.approve`)
- [x] 4.3 `approvals-ui` — OT approval queue + detail; mobile cash-advance approval with re-auth (MD3)
- [x] 4.4 `attendance-ui` — import + monthly grid
- [x] 4.5 `tax-exports-ui` — PND.1 / SSO async export (job-toast → download) (MD5)

## 5. i18n, a11y & Storybook

- [x] 5.1 TH+EN strings for `hr`; BE/CE dates on payslips and periods
- [x] 5.2 WCAG AA: wizard stepper focus order, masked-field lock semantics, chips not color-only,
  one-hand mobile approval targets
- [x] 5.3 Stories: PayrollWizard, PayslipBreakdownDrawer, CashAdvanceApprovalCard at theme×density×locale

## 6. Verification

- [x] 6.1 `pnpm --filter @erp/web build && typecheck && lint` green; Storybook renders
- [x] 6.2 Salary fields masked without `hr.salary.view` (layout stable); routes gated by permission
- [x] 6.3 Drive: payroll run → missing-data gate → calculate (job) → review (outlier flagged) →
  approve (guarded) → payslip drawer shows full formula; cash-advance approved one-handed with re-auth
  — ⚠ found and fixed two defects while driving the flow: (1) `payroll-run-detail.tsx` hardcoded
  every payslip row's `base` to `"0"`, which made `PayrollWizard`'s outlier heuristic
  (`net > base × 2`) trivially true for every positive-net payslip; (2) the payslip breakdown
  drawer only ever showed a single "Net" line because `PayslipSummary` didn't expose the
  `payslip.breakdown` the backend already computes and persists. Extended the `hr` contract with
  `PayLine`/`PayslipBreakdown` and a gated `PayslipSummary.breakdown` field (mirroring the
  `gross`/`net` gating), wired `apps/api`'s `listPayslips` to select and return it, and rebuilt
  the screen's payslip rows/breakdown lines from the real data.
