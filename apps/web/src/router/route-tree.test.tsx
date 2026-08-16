import { describe, it, expect } from "vitest";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import type { Permission } from "@erp/contracts";
import { routeTree } from "./route-tree";
import type { Session } from "../session/session-context";
import type { AuthUser } from "../session/dev-user";

function sessionFor(user: AuthUser): Session {
  return {
    user,
    isSuperAdmin: user.isSuperAdmin,
    hasPermission: (p) => user.isSuperAdmin || user.permissions.includes(p),
    signIn: () => {},
    signOut: () => {},
  };
}

const superAdmin: AuthUser = {
  id: "s",
  name: "Super Admin",
  email: "s@example.com",
  isSuperAdmin: true,
  permissions: [],
};

function userWith(permissions: Permission[]): AuthUser {
  return { id: "u", name: "User", email: "u@example.com", isSuperAdmin: false, permissions };
}

/** Resolve the real route tree at `path` for `user` and return the final pathname (after any
 *  `beforeLoad` redirect). `router.load()` runs guards without rendering page components. */
async function resolvePath(path: string, user: AuthUser): Promise<string> {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { session: sessionFor(user) },
  });
  await router.load();
  return router.state.location.pathname;
}

describe("module-root index redirect", () => {
  it("redirects each landing-less module to its first sub-route instead of the placeholder", async () => {
    expect(await resolvePath("/inventory", superAdmin)).toBe("/inventory/items");
    expect(await resolvePath("/production", superAdmin)).toBe("/production/timeline");
    expect(await resolvePath("/sales", superAdmin)).toBe("/sales/documents");
    expect(await resolvePath("/hr", superAdmin)).toBe("/hr/employees");
    expect(await resolvePath("/admin", superAdmin)).toBe("/admin/users");
  });

  it("respects permissions — lands on the first sub-route the user may actually open", async () => {
    const user = userWith(["sales.payment.record"]);
    expect(await resolvePath("/sales", user)).toBe("/sales/payments");
  });

  it("leaves modules that have a real landing page untouched", async () => {
    expect(await resolvePath("/", superAdmin)).toBe("/");
    expect(await resolvePath("/reports", superAdmin)).toBe("/reports");
  });

  it("does not redirect a sub-route that was navigated to directly", async () => {
    expect(await resolvePath("/inventory/receipts", superAdmin)).toBe("/inventory/receipts");
  });
});
