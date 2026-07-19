import { describe, it, expect } from "vitest";
import type { Session } from "../session/session-context";
import { userHasPermission } from "../session/session-context";
import { userWith, superAdmin } from "../test/render";
import type { AuthUser } from "../session/dev-user";
import { requireModuleAccess, requireReportAccess, requireRouteAccess, requireSession } from "./guards";
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

describe("requireRouteAccess with an hr.* permission (no superAdminOnly)", () => {
  const otRoute: GatedEntry = { permissions: ["hr.ot.approve"] };

  it("redirects a signed-in user lacking the permission", () => {
    const session = sessionFor(userWith([]));
    expect(() => requireRouteAccess(session, otRoute)).toThrow();
  });

  it("admits a signed-in non-super-admin holding the exact permission", () => {
    const session = sessionFor(userWith(["hr.ot.approve"]));
    expect(() => requireRouteAccess(session, otRoute)).not.toThrow();
  });
});

describe("requireReportAccess", () => {
  it("redirects to /login when signed out, before resolving the report key", () => {
    expect(() => requireReportAccess(sessionFor(null), "sales.overview")).toThrow();
  });

  it("redirects to /reports for an unknown report_key", () => {
    const session = sessionFor(userWith(["report.sales.view"]));
    expect(() => requireReportAccess(session, "not.a.real.report")).toThrow();
  });

  it("admits a signed-in user holding the report's group permission", () => {
    const session = sessionFor(userWith(["report.sales.view"]));
    expect(() => requireReportAccess(session, "sales.overview")).not.toThrow();
  });

  it("redirects a signed-in user lacking the report's group permission", () => {
    const session = sessionFor(userWith(["report.sales.view"]));
    expect(() => requireReportAccess(session, "cost.valuation")).toThrow();
  });

  it("requires only report.<group>.view, not inventory.cost.view, for cost/profit reports", () => {
    const session = sessionFor(userWith(["report.cost.view"]));
    expect(() => requireReportAccess(session, "cost.valuation")).not.toThrow();
  });

  it("admits a super admin for any report key", () => {
    expect(() => requireReportAccess(sessionFor(superAdmin), "tax.pp30")).not.toThrow();
  });
});
