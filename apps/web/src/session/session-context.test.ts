import { describe, it, expect } from "vitest";
import { PERMISSIONS } from "@erp/contracts";
import { userHasPermission } from "./session-context";
import type { AuthUser } from "./dev-user";

const base = { id: "u", name: "U", email: "u@example.com" };

describe("userHasPermission", () => {
  it("grants only the permissions in the user's set", () => {
    const user: AuthUser = {
      ...base,
      isSuperAdmin: false,
      permissions: ["inventory.issue.manage"],
    };
    expect(userHasPermission(user, "inventory.issue.manage")).toBe(true);
    expect(userHasPermission(user, "sales.invoice.create")).toBe(false);
  });

  it("grants every catalog permission to a super admin with an empty set", () => {
    const superAdmin: AuthUser = { ...base, isSuperAdmin: true, permissions: [] };
    for (const permission of PERMISSIONS) {
      expect(userHasPermission(superAdmin, permission)).toBe(true);
    }
  });

  it("grants nothing to a logged-out (null) user", () => {
    expect(userHasPermission(null, "sales.invoice.create")).toBe(false);
  });
});
