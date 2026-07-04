// Permission catalog — single source of truth (spec §1, §5.2).
// Both api (authorization guards) and web (UI gating) import these exact strings.
// Codes follow module.resource.action; grouped by module, alphabetical within group.
// M0 lands the full M1–M6 set so @Permissions(...)/assertPermissions(...) typo-check;
// the M1–M6 plans own the semantics of each code.
export const PERMISSIONS = [
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
  // production (M4) — production.scan is two-segment per the M4 plan
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
  // sales (M5) — sales.invoice.approve retained from the original skeleton catalog
  "sales.customer.manage",
  "sales.document.void",
  "sales.etax.submit",
  "sales.invoice.approve",
  "sales.invoice.create",
  "sales.payment.record",
  "sales.quotation.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const permissionSet = new Set<string>(PERMISSIONS);

/** Type guard: is the given string a known permission? */
export function isPermission(value: string): value is Permission {
  return permissionSet.has(value);
}
