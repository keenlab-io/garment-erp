import { describe, it, expect } from "vitest";
import type { Permission } from "@erp/contracts";
import { MODULES, ADMIN_ROUTES } from "./registry";
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
