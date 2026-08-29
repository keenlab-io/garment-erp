# M2 — HR & Payroll (Frontend): Design

## Context

M2 frontend spans desktop precision (payroll) and mobile approvals (owner). The signature is the
**payroll run workspace** — a wizard whose credibility depends on making the net-pay formula
visible. Salary/pay figures are gated everywhere by `hr.salary.view`. `frontend only`, consuming
the `hr` contract.

Sequenced **after `m0-frontend-foundation`** + backend `m2-hr-payroll`.

## Shared frontend conventions (FD1–FD12)

Follows the frontend module set's cross-cutting decisions: M0 `@erp/ui` + tokens (FD1); typed
`@ts-rest/react-query` data (FD2); routes-as-metadata nav/palette (FD3); `InkChip` for
payroll-flag/approval statuses (FD4); **`MaskedValue` for all salary/pay figures gated on
`hr.salary.view`** (FD5); guarded `ConfirmDialog` for payroll approve + cash-advance re-auth
(FD6); **job-toast** for payslip PDFs and PND.1/SSO exports (FD7); `hr` i18next namespace + BE/CE
dates (FD8); app isolation (FD12).

## Module decisions

### MD1. Payroll run wizard with transparent math
The run workspace is a stepper: **Inputs** (employees in scope; missing-data gates — no salary,
unreconciled OT — that must be resolved or excluded), **Calculate** (async job → payslip preview
table: base/OT/allowances/deductions/SSO/tax/advance/**NET**), **Review** (sortable/searchable;
outliers auto-flagged with a warning chip when net ≤ 0 or net > 2× base), **Approve** (guarded
`ConfirmDialog` stating "locks the run, pulls outstanding advances, generates payslips", perm
`hr.payroll.approve`). Money columns are tabular, right-aligned, NET emphasized; negative
deductions in danger with parentheses.

### MD2. Payslip breakdown drawer shows every term
Clicking a payslip row opens a read-only drawer that renders the **net-pay formula line by
line** — nothing is a black box. Values are masked for users without `hr.salary.view`.

### MD3. Mobile cash-advance approval
The cash-advance approval renders as a single thumb-reachable card (employee · amount · reason ·
**ceiling-check badge** ✓ within 50% / ⚠ over). Approve requires Super-Admin **re-auth**; Reject
captures a reason. No table on mobile.

### MD4. Employee detail with masked salary + secure documents
Employee detail is tabbed (Profile · Documents · Salary · Pay components · Reporting). The Salary
tab and any pay figures are `MaskedValue` (`••••` + lock) without `hr.salary.view`. The Documents
tab is a secure list with **signed-URL download** (no inline render of ID cards). Probation-ending
shows a warning banner with the date.

### MD5. Async exports
Payslip PDF generation and PND.1/SSO exports use the **job-toast** pattern (202 `{ job_id }` →
notification with download). Rows show "PDF pending" until the job completes.

## Risks / Trade-offs

- **Masking is display-only** — the backend must omit gated salary values; the UI never places a
  masked value in the DOM.
- **Outlier heuristics** (net ≤ 0, > 2× base) are guidance, not gates — approval still requires
  human confirm.

## Sequencing

After `m0-frontend-foundation` + backend `m2-hr-payroll`. Implemented later in the UX Part C
order (after M1/M3/M5/M4).

## Open Questions

- Attendance import file format/columns (mirror the backend importer).
- Whether the owner approval surfaces are a dedicated mobile route or responsive collapse of the queues.
