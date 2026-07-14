import { createRoute } from "@tanstack/react-router";
import { MODULES } from "../nav/registry";
import type { ModuleDescriptor } from "../nav/types";
import { rootRoute } from "./root.route";
import { requireModuleAccess } from "./guards";
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

// The login route is intentionally outside the nav registry and unguarded (guarding it would loop).
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
  staticData: { title: "login.title" },
});

export const routeTree = rootRoute.addChildren([
  ...MODULES.map(moduleRoute),
  loginRoute,
]);
