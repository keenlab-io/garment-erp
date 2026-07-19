import { describe, it, expect } from "vitest";
import type { Permission } from "@erp/contracts";
import {
  MODULES,
  ADMIN_ROUTES,
  HR_ROUTES,
  INVENTORY_ROUTES,
  PRODUCTION_ROUTES,
  SALES_ROUTES,
  REPORTING_DASHBOARD_ROUTES,
  REPORTING_ROUTES,
} from "./registry";
import { filterNav, isModuleVisible, type NavGate } from "./filter";

const keys = (gate: NavGate) => filterNav(MODULES, gate).map((m) => m.key);

/** A gate granting exactly the given permissions, never a super admin. */
function gateWith(...granted: Permission[]): NavGate {
  const set = new Set<Permission>(granted);
  return { isSuperAdmin: false, has: (p) => set.has(p) };
}

describe("filterNav", () => {
  it("shows only ungated modules to a user with no permissions", () => {
    expect(keys(gateWith())).toEqual(["dashboard"]);
  });

  it("reveals a module when the user has any permission in its namespace", () => {
    const visible = keys(gateWith("sales.invoice.create"));
    expect(visible).toContain("sales");
    expect(visible).not.toContain("inventory");
    expect(visible).not.toContain("hr");
  });

  it("keeps Admin absent for a non-super-admin even with every catalog permission", () => {
    const everything = gateWith(...MODULES.flatMap((m) => m.permissions ?? []));
    const visible = keys(everything);
    expect(visible).toContain("sales");
    expect(visible).toContain("inventory");
    expect(visible).not.toContain("admin"); // superAdminOnly — absent, not disabled
  });

  it("shows every module, including Admin, to a super admin", () => {
    const superAdmin: NavGate = { isSuperAdmin: true, has: () => false };
    expect(keys(superAdmin)).toEqual(MODULES.map((m) => m.key));
  });
});

// Admin & Access sub-routes (users/roles/audit/import) aren't `ModuleDescriptor`s, but their
// `permissions` field is a fixed super-admin-only entry — `isModuleVisible` gates them the same way
// once the route's `beforeLoad` passes `superAdminOnly: true` (see router/guards.ts `requireRouteAccess`).
describe("isModuleVisible with an Admin & Access sub-route entry", () => {
  it("is absent for a non-super-admin even holding the exact iam permission", () => {
    const [users] = ADMIN_ROUTES;
    const gate = gateWith(...users!.permissions);
    expect(isModuleVisible({ permissions: users!.permissions, superAdminOnly: true }, gate)).toBe(false);
  });

  it("is visible to a super admin for every admin sub-route", () => {
    const gate: NavGate = { isSuperAdmin: true, has: () => false };
    for (const entry of ADMIN_ROUTES) {
      expect(isModuleVisible({ permissions: entry.permissions, superAdminOnly: true }, gate)).toBe(true);
    }
  });
});

// HR & Payroll sub-routes are gated by their own `hr.*` permission(s), not a blanket Super-Admin
// requirement — unlike Admin & Access, a non-super-admin holding the exact permission gets in.
describe("isModuleVisible with an HR & Payroll sub-route entry", () => {
  it("is visible to a non-super-admin holding the exact hr permission", () => {
    for (const entry of HR_ROUTES) {
      const gate = gateWith(...entry.permissions);
      expect(isModuleVisible(entry, gate)).toBe(true);
    }
  });

  it("is absent for a non-super-admin holding no permissions", () => {
    for (const entry of HR_ROUTES) {
      expect(isModuleVisible(entry, gateWith())).toBe(false);
    }
  });

  it("is visible to a super admin for every hr sub-route", () => {
    const gate: NavGate = { isSuperAdmin: true, has: () => false };
    for (const entry of HR_ROUTES) {
      expect(isModuleVisible(entry, gate)).toBe(true);
    }
  });
});

// Inventory & Costing sub-routes follow the same pattern as HR & Payroll: gated by their own
// inventory.* permission(s), not a blanket Super-Admin requirement.
describe("isModuleVisible with an Inventory & Costing sub-route entry", () => {
  it("is visible to a non-super-admin holding the exact inventory permission", () => {
    for (const entry of INVENTORY_ROUTES) {
      const gate = gateWith(...entry.permissions);
      expect(isModuleVisible(entry, gate)).toBe(true);
    }
  });

  it("is absent for a non-super-admin holding no permissions", () => {
    for (const entry of INVENTORY_ROUTES) {
      expect(isModuleVisible(entry, gateWith())).toBe(false);
    }
  });

  it("is visible to a super admin for every inventory sub-route", () => {
    const gate: NavGate = { isSuperAdmin: true, has: () => false };
    for (const entry of INVENTORY_ROUTES) {
      expect(isModuleVisible(entry, gate)).toBe(true);
    }
  });

  it("only flags the scan-first goods-issue route as kiosk (Touch auto-applies there, MD2)", () => {
    const kioskKeys = INVENTORY_ROUTES.filter((entry) => entry.kiosk).map((entry) => entry.key);
    expect(kioskKeys).toEqual(["inventory-issues"]);
  });
});

// Production Tracking sub-routes follow the same pattern as HR & Payroll / Inventory & Costing:
// gated by their own production.* permission(s), not a blanket Super-Admin requirement.
describe("isModuleVisible with a Production Tracking sub-route entry", () => {
  it("is visible to a non-super-admin holding the exact production permission", () => {
    for (const entry of PRODUCTION_ROUTES) {
      const gate = gateWith(...entry.permissions);
      expect(isModuleVisible(entry, gate)).toBe(true);
    }
  });

  it("is absent for a non-super-admin holding no permissions", () => {
    for (const entry of PRODUCTION_ROUTES) {
      expect(isModuleVisible(entry, gateWith())).toBe(false);
    }
  });

  it("is visible to a super admin for every production sub-route", () => {
    const gate: NavGate = { isSuperAdmin: true, has: () => false };
    for (const entry of PRODUCTION_ROUTES) {
      expect(isModuleVisible(entry, gate)).toBe(true);
    }
  });

  it("only flags the scan station as kiosk (Touch auto-applies there, MD2)", () => {
    const kioskKeys = PRODUCTION_ROUTES.filter((entry) => entry.kiosk).map((entry) => entry.key);
    expect(kioskKeys).toEqual(["production-scan"]);
  });
});

// Sales sub-routes follow the same pattern as HR & Payroll / Inventory & Costing / Production
// Tracking: gated by their own sales.* (or report.sales.view) permission(s), not a blanket
// Super-Admin requirement.
describe("isModuleVisible with a Sales sub-route entry", () => {
  it("is visible to a non-super-admin holding the exact sales permission", () => {
    for (const entry of SALES_ROUTES) {
      const gate = gateWith(...entry.permissions);
      expect(isModuleVisible(entry, gate)).toBe(true);
    }
  });

  it("is absent for a non-super-admin holding no permissions", () => {
    for (const entry of SALES_ROUTES) {
      expect(isModuleVisible(entry, gateWith())).toBe(false);
    }
  });

  it("is visible to a super admin for every sales sub-route", () => {
    const gate: NavGate = { isSuperAdmin: true, has: () => false };
    for (const entry of SALES_ROUTES) {
      expect(isModuleVisible(entry, gate)).toBe(true);
    }
  });
});

// Reporting & Analytics sub-routes (domain dashboards + schedules manager) follow the same
// pattern as HR & Payroll / Inventory & Costing / Production Tracking / Sales: gated by their own
// report.* permission(s), not a blanket Super-Admin requirement.
describe("isModuleVisible with a Reporting & Analytics sub-route entry", () => {
  const REPORTING_ENTRIES = [...REPORTING_DASHBOARD_ROUTES, ...REPORTING_ROUTES];

  it("is visible to a non-super-admin holding the exact report permission", () => {
    for (const entry of REPORTING_ENTRIES) {
      const gate = gateWith(...entry.permissions);
      expect(isModuleVisible(entry, gate)).toBe(true);
    }
  });

  it("is absent for a non-super-admin holding no permissions", () => {
    for (const entry of REPORTING_ENTRIES) {
      expect(isModuleVisible(entry, gateWith())).toBe(false);
    }
  });

  it("is visible to a super admin for every reporting sub-route", () => {
    const gate: NavGate = { isSuperAdmin: true, has: () => false };
    for (const entry of REPORTING_ENTRIES) {
      expect(isModuleVisible(entry, gate)).toBe(true);
    }
  });

  it("gates each domain dashboard by its own report.<group>.view permission, not another group's", () => {
    const salesDashboard = REPORTING_DASHBOARD_ROUTES.find((e) => e.key === "reports-dashboard-sales")!;
    const gate = gateWith("report.cost.view");
    expect(isModuleVisible(salesDashboard, gate)).toBe(false);
  });
});
