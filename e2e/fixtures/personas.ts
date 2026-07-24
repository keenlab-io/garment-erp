/**
 * Test personas — named permission sets mapped to the `@erp/contracts` catalog.
 *
 * IMPORTANT (see docs/testing/UI_TEST_PLAN.md "Personas"): in the RUNNING app,
 * `VITE_DEV_PERMISSIONS`/`createDevUser` is NOT a login bypass — `apps/web/src/main.tsx` always
 * seeds the session from the real refresh flow. So every browser persona below is a REAL logged-in
 * user. The DB seed creates ONLY the super-admin (`superadmin` / `changeme`). To exercise a limited
 * persona you must first create a matching user + role via the Admin UI (/admin/users, /admin/roles)
 * or extend the seed. `createPersonaViaApi()` sketches the API path but is intentionally not wired to
 * live endpoints yet — treat limited-persona setup as an explicit test-data prerequisite (KNOWN GAP).
 */

export interface Persona {
  /** Stable key used for the saved storage-state filename (.auth/<key>.json). */
  key: string;
  /** Human label shown in the test title. */
  label: string;
  /** Exact catalog permission codes this persona should hold ([] + isSuperAdmin for super-admin). */
  permissions: string[];
  isSuperAdmin?: boolean;
}

export const SUPER_ADMIN: Persona = {
  key: "superadmin",
  label: "Super Admin",
  permissions: [],
  isSuperAdmin: true,
};

/** One representative limited persona per module (extend as coverage grows). */
export const PERSONAS: Record<string, Persona> = {
  superadmin: SUPER_ADMIN,
  salesClerk: {
    key: "salesClerk",
    label: "Sales Clerk",
    permissions: ["sales.quotation.manage", "sales.invoice.create", "sales.customer.manage"],
  },
  payrollApprover: {
    key: "payrollApprover",
    label: "Payroll Approver",
    permissions: ["hr.payroll.approve", "hr.employee.view", "hr.salary.view"],
  },
  inventoryOperator: {
    key: "inventoryOperator",
    label: "Inventory Operator",
    permissions: ["inventory.product.create", "inventory.issue.manage", "inventory.receipt.manage"],
  },
  productionScanner: {
    key: "productionScanner",
    label: "Production Scanner",
    permissions: ["production.scan"],
  },
  reportsViewer: {
    key: "reportsViewer",
    label: "Reports Viewer",
    permissions: ["report.sales.view", "report.inventory.view"],
  },
  none: {
    key: "none",
    label: "No permissions",
    permissions: [],
  },
};

/** Seeded super-admin credentials (override password via SEED_SUPERADMIN_PASSWORD). */
export const SUPERADMIN_CREDENTIALS = {
  username: process.env.SEED_SUPERADMIN_USERNAME ?? "superadmin",
  password: process.env.SEED_SUPERADMIN_PASSWORD ?? "changeme",
};
