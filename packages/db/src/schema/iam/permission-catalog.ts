// Permission catalog — DB-side duplicate of the `@erp/contracts` PERMISSIONS array.
// `@erp/db` may not import `@erp/contracts` (M0 design D1), so the seed reads the codes
// from here; a runtime parity test in `apps/api` (`permissions.parity.spec.ts`) asserts
// this list equals the contract catalog, so any drift fails the build. Grouped by module,
// alphabetical within group — keep in lockstep with `packages/contracts/src/permissions/catalog.ts`.
export const PERMISSION_CODES = [
  // hr (M2)
  "hr.employee.manage",
  "hr.employee.view",
  "hr.ot.approve",
  "hr.payroll.approve",
  "hr.payslip.view",
  "hr.salary.edit",
  "hr.salary.view",
  // iam (M1)
  "iam.audit.view",
  "iam.role.manage",
  "iam.user.force_logout",
  "iam.user.manage",
  // inventory (M3)
  "inventory.adjustment.approve",
  "inventory.cost.view",
  "inventory.issue.manage",
  "inventory.product.create",
  "inventory.receipt.manage",
  // production (M4)
  "production.scan",
  "production.subcontract.manage",
  "production.wo.manage",
  // reporting (M6)
  "report.cost.view",
  "report.inventory.view",
  "report.profit.view",
  "report.sales.view",
  "report.schedule.manage",
  "report.tax.view",
  // sales (M5)
  "sales.customer.manage",
  "sales.document.void",
  "sales.etax.submit",
  "sales.invoice.approve",
  "sales.invoice.create",
  "sales.payment.record",
  "sales.quotation.manage",
] as const;
