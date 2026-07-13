import { describe, it, expect } from "vitest";
import type { Permission } from "@erp/contracts";
import { MODULES } from "./registry";
import { filterNav, type NavGate } from "./filter";

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
