import { createRoute } from "@tanstack/react-router";
import { MODULES, ADMIN_ROUTES } from "../nav/registry";
import type { AdminRouteDescriptor, ModuleDescriptor } from "../nav/types";
import { rootRoute } from "./root.route";
import { requireModuleAccess, requireRouteAccess } from "./guards";
import { DashboardPage } from "./routes/dashboard";
import { ModulePlaceholder } from "./routes/placeholder";
import { LoginPage } from "./routes/login";

// One route per module, generated from the single nav registry so routes, nav, and the palette
// never drift. Dashboard gets its own page; every other module uses the shared placeholder until
// its M1–M6 UI ships.
function moduleRoute(module: ModuleDescriptor) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path: module.path,
    component: module.key === "dashboard" ? DashboardPage : ModulePlaceholder,
    staticData: {
      title: module.titleKey,
      kiosk: module.kiosk,
      permissions: module.permissions,
      navKey: module.key,
    },
    beforeLoad: ({ context }) => requireModuleAccess(context.session, module),
  });
}

// Admin & Access sub-routes (Users/Roles/Audit/Import lists) — Super-Admin gated in addition to
// their specific iam.* permission, sharing `ModulePlaceholder` until M1's screens (§4) land.
function adminRoute(entry: AdminRouteDescriptor) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path: entry.path,
    component: ModulePlaceholder,
    staticData: {
      title: entry.titleKey,
      breadcrumb: entry.titleKey,
      permissions: entry.permissions,
      navKey: "admin",
    },
    beforeLoad: ({ context }) =>
      requireRouteAccess(context.session, { permissions: entry.permissions, superAdminOnly: true }),
  });
}

// The `$id` detail routes have no fixed nav/palette entry (the id varies), so they're registered
// directly rather than through `ADMIN_ROUTES`.
const adminUserDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/users/$id",
  component: ModulePlaceholder,
  staticData: {
    title: "iam:nav.userDetail",
    breadcrumb: "iam:nav.userDetail",
    permissions: ["iam.user.manage"],
    navKey: "admin",
  },
  beforeLoad: ({ context }) =>
    requireRouteAccess(context.session, { permissions: ["iam.user.manage"], superAdminOnly: true }),
});

const adminRoleDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/roles/$id",
  component: ModulePlaceholder,
  staticData: {
    title: "iam:nav.roleDetail",
    breadcrumb: "iam:nav.roleDetail",
    permissions: ["iam.role.manage"],
    navKey: "admin",
  },
  beforeLoad: ({ context }) =>
    requireRouteAccess(context.session, { permissions: ["iam.role.manage"], superAdminOnly: true }),
});

// The login route is intentionally outside the nav registry and unguarded (guarding it would loop).
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
  staticData: { title: "login.title" },
});

export const routeTree = rootRoute.addChildren([
  ...MODULES.map(moduleRoute),
  ...ADMIN_ROUTES.map(adminRoute),
  adminUserDetailRoute,
  adminRoleDetailRoute,
  loginRoute,
]);
