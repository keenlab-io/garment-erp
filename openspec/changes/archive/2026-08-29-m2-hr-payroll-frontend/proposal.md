# M2 — HR & Payroll (Frontend)

## Why

HR runs the monthly payroll and manages people; the Owner approves OT and cash advances from a
phone. M2 frontend delivers both contexts on one system: a desktop **payroll run wizard** whose
trust comes from showing the net-pay math line by line, and a **mobile one-hand approval** card.
Salary is sensitive, so every monetary field is permission-masked.

**UI-only** — consumes the `hr` contract in `@erp/contracts` and the M0 foundation.

## What Changes

- **HR & Payroll module** routes (nav item `◷ HR & Payroll`): Employees, OT requests, Cash
  advances, Attendance, Payroll (run list + run workspace + payslip), Tax exports.
- The marquee **payroll run wizard** (Inputs → Calculate → Review → Approve) with a
  formula-transparent payslip breakdown drawer and guarded approve.
- A **mobile-first cash-advance approval** flow with re-auth.
- Reuses M0 `DataTable`, `MaskedValue` (salary gating), `ConfirmDialog`, job-toast, Drawer.

## Capabilities

New:
1. **employee-management-ui** — employees list + detail (tabbed), create/edit, salary masking,
   document vault.
2. **payroll-run-ui** — the run wizard, payslip preview, breakdown drawer, guarded approve.
3. **approvals-ui** — OT queue + cash-advance mobile approval (re-auth).
4. **attendance-ui** — attendance import + monthly grid.
5. **tax-exports-ui** — PND.1 / SSO async export.

## Impact

- **Affected code:** `apps/web` `hr` routes/screens consuming the `hr` contract; new `hr`
  i18next namespace (TH+EN).
- **Depends on:** `m0-frontend-foundation` + backend `m2-hr-payroll` contract.
- **No new dependencies.** Contract-only; no cross-app import.
