import type * as React from "react";
import { createRoute } from "@tanstack/react-router";
import { MODULES, ADMIN_ROUTES } from "../nav/registry";
import type { AdminRouteDescriptor, ModuleDescriptor } from "../nav/types";
import { rootRoute } from "./root.route";
import { requireModuleAccess, requireRouteAccess } from "./guards";
import { DashboardPage } from "./routes/dashboard";
import { ModulePlaceholder } from "./routes/placeholder";
import { LoginPage, validateLoginSearch } from "./routes/login";
import { UsersListPage } from "./routes/admin/users-list";
import { UserDetailPage } from "./routes/admin/user-detail";
import { RolesListPage } from "./routes/admin/roles-list";
import { RoleDetailPage } from "./routes/admin/role-detail";
import { AuditLogPage } from "./routes/admin/audit-log";
import { PermissionImportPage } from "./routes/admin/permission-import";

/** The M1 §4 screens, keyed by `AdminRouteDescriptor.key` — every other admin route (none currently)
 * keeps the shared `ModulePlaceholder` until its screen ships. */
const ADMIN_ROUTE_COMPONENTS: Record<string, () => React.ReactElement> = {
  "admin-users": UsersListPage,
  "admin-roles": RolesListPage,
  "admin-audit": AuditLogPage,
  "admin-import": PermissionImportPage,
};

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
// their specific iam.* permission. Each now renders its M1 §4 screen; a future admin route without
// one yet would fall back to `ModulePlaceholder`.
function adminRoute(entry: AdminRouteDescriptor) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path: entry.path,
    component: ADMIN_ROUTE_COMPONENTS[entry.key] ?? ModulePlaceholder,
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
  component: UserDetailPage,
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
  component: RoleDetailPage,
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
  validateSearch: validateLoginSearch,
});

export const routeTree = rootRoute.addChildren([
  ...MODULES.map(moduleRoute),
  ...ADMIN_ROUTES.map(adminRoute),
  adminUserDetailRoute,
  adminRoleDetailRoute,
  loginRoute,
]);
