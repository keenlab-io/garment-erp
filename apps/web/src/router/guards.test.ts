import { describe, it, expect } from "vitest";
import type { Session } from "../session/session-context";
import { userHasPermission } from "../session/session-context";
import { userWith, superAdmin } from "../test/render";
import type { AuthUser } from "../session/dev-user";
import { requireModuleAccess, requireRouteAccess, requireSession } from "./guards";
import { MODULES } from "../nav/registry";
import type { GatedEntry } from "../nav/filter";

function sessionFor(user: AuthUser | null): Session {
  return {
    user,
    isSuperAdmin: user?.isSuperAdmin ?? false,
    hasPermission: (permission) => userHasPermission(user, permission),
    signIn: () => {},
    signOut: () => {},
  };
}

describe("requireSession", () => {
  it("redirects to /login when there is no user", () => {
    expect(() => requireSession(sessionFor(null))).toThrow();
  });

  it("does not throw for a signed-in session", () => {
    expect(() => requireSession(sessionFor(userWith([])))).not.toThrow();
  });
});

describe("requireModuleAccess", () => {
  const admin = MODULES.find((m) => m.key === "admin")!;

  it("redirects a non-super-admin away from the Admin & Access module even with every iam permission", () => {
    const session = sessionFor(userWith([...(admin.permissions ?? [])]));
    expect(() => requireModuleAccess(session, admin)).toThrow();
  });

  it("admits a super admin", () => {
    expect(() => requireModuleAccess(sessionFor(superAdmin), admin)).not.toThrow();
  });
});

describe("requireRouteAccess", () => {
  const usersRoute: GatedEntry = { permissions: ["iam.user.manage"], superAdminOnly: true };

  it("redirects to /login when signed out, before checking permissions", () => {
    expect(() => requireRouteAccess(sessionFor(null), usersRoute)).toThrow();
  });

  it("redirects a signed-in non-super-admin even holding the exact permission", () => {
    const session = sessionFor(userWith(["iam.user.manage"]));
    expect(() => requireRouteAccess(session, usersRoute)).toThrow();
  });

  it("admits a super admin", () => {
    expect(() => requireRouteAccess(sessionFor(superAdmin), usersRoute)).not.toThrow();
  });
});
