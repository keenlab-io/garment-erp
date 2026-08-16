/**
 * Test personas — named permission sets mapped to the `@erp/contracts` catalog.
 *
 * IMPORTANT (see docs/testing/UI_TEST_PLAN.md "Personas"): in the RUNNING app,
 * `VITE_DEV_PERMISSIONS`/`createDevUser` is NOT a login bypass — `apps/web/src/main.tsx` always
 * seeds the session from the real refresh flow. So every browser persona below is a REAL logged-in
 * user.
 *
 * `pnpm db:seed` creates all of them: a role holding exactly the permissions listed here, a user
 * whose **username is the persona `key` verbatim**, and the binding between the two. Password is
 * `SEED_PERSONA_PASSWORD` (default `changeme`) — see `PERSONA_PASSWORD` below. No Admin-UI
 * bootstrap step is required any more.
 *
 * This list and `SEED_PERSONAS` in `packages/db/src/seed/seed.ts` must stay 1:1 — the seed is what
 * makes these logins real, so a persona here that the seed doesn't create cannot log in.
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

/** The UI_TEST_PLAN §4 persona table, seeded by `pnpm db:seed`. Keep in sync with the seed. */
export const PERSONAS: Record<string, Persona> = {
  superadmin: SUPER_ADMIN,
  salesClerk: {
    key: "salesClerk",
    label: "Sales Clerk",
    permissions: [
      "sales.quotation.manage",
      "sales.invoice.create",
      "sales.customer.manage",
      "sales.payment.record",
    ],
  },
  salesSupervisor: {
    key: "salesSupervisor",
    label: "Sales Supervisor",
    permissions: [
      "sales.quotation.manage",
      "sales.invoice.create",
      "sales.invoice.approve",
      "sales.document.void",
      "sales.etax.submit",
      "sales.payment.record",
      "report.sales.view",
    ],
  },
  payrollApprover: {
    key: "payrollApprover",
    label: "Payroll Approver",
    permissions: ["hr.payroll.approve", "hr.ot.approve", "hr.salary.view", "hr.payslip.view"],
  },
  hrOfficer: {
    key: "hrOfficer",
    label: "HR Officer",
    // No hr.salary.view — this persona is how the masked-salary assertions are exercised.
    permissions: ["hr.employee.view", "hr.employee.manage"],
  },
  inventoryOperator: {
    key: "inventoryOperator",
    label: "Inventory Operator",
    // No inventory.cost.view — this persona is how the masked-cost assertions are exercised.
    permissions: ["inventory.product.create", "inventory.receipt.manage", "inventory.issue.manage"],
  },
  inventoryApprover: {
    key: "inventoryApprover",
    label: "Inventory Approver",
    permissions: ["inventory.issue.manage", "inventory.adjustment.approve", "inventory.cost.view"],
  },
  productionScanner: {
    key: "productionScanner",
    label: "Production Scanner",
    permissions: ["production.scan"],
  },
  productionPlanner: {
    key: "productionPlanner",
    label: "Production Planner",
    permissions: ["production.wo.manage", "production.subcontract.manage"],
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

/** Seeded persona password (override via SEED_PERSONA_PASSWORD, same var the seed reads). */
export const PERSONA_PASSWORD = process.env.SEED_PERSONA_PASSWORD ?? "changeme";

/** Credentials for any seeded persona — username IS the persona key. */
export function personaCredentials(persona: Persona): { username: string; password: string } {
  return persona.isSuperAdmin
    ? SUPERADMIN_CREDENTIALS
    : { username: persona.key, password: PERSONA_PASSWORD };
}

/**
 * Saved storage-state file for a persona, written by `tests/auth.setup.ts`. Use it to run a spec
 * as someone other than the super-admin the `app` project defaults to:
 *
 *   test.use({ storageState: personaStatePath(PERSONAS.hrOfficer) });
 */
export function personaStatePath(persona: Persona): string {
  return `.auth/${persona.key}.json`;
}

/** Seeded super-admin credentials (override password via SEED_SUPERADMIN_PASSWORD). */
export const SUPERADMIN_CREDENTIALS = {
  username: process.env.SEED_SUPERADMIN_USERNAME ?? "superadmin",
  password: process.env.SEED_SUPERADMIN_PASSWORD ?? "changeme",
};
