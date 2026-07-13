import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createRoute,
  createMemoryHistory,
} from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n/i18n";
import { SessionProvider } from "../session/session-context";
import type { AuthUser } from "../session/dev-user";
import { MODULES } from "../nav/registry";

/** A user with exactly the given permissions (never super admin). */
export function userWith(permissions: AuthUser["permissions"]): AuthUser {
  return { id: "t", name: "Test User", email: "t@example.com", isSuperAdmin: false, permissions };
}

export const superAdmin: AuthUser = {
  id: "s",
  name: "Super Admin",
  email: "s@example.com",
  isSuperAdmin: true,
  permissions: [],
};

/**
 * Render a shell component inside the providers it needs (i18n, session, a minimal memory router so
 * TanStack `Link`/`useMatches` work). Pass a controlled `user` to exercise permission-filtering.
 */
export async function renderInShell(ui: ReactNode, { user }: { user?: AuthUser | null } = {}) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> });
  // Register the real module paths (+ login) so TanStack `Link` resolves hrefs in tests.
  const paths = [...new Set(["/", ...MODULES.map((m) => m.path), "/login"])];
  const childRoutes = paths.map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(childRoutes),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  // Resolve the initial match so the tree renders synchronously after this returns.
  await router.load();

  return render(
    <I18nextProvider i18n={i18n}>
      <SessionProvider initialUser={user}>
        <RouterProvider router={router} />
      </SessionProvider>
    </I18nextProvider>,
  );
}
