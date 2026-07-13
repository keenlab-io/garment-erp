import { LayoutDashboard, Boxes, Factory, ReceiptText, Users, BarChart3, ShieldCheck } from "lucide-react";
import { PERMISSIONS, type Permission } from "@erp/contracts";
import type { ModuleDescriptor } from "./types";

/** All catalog permissions in a module's namespace (e.g. every `sales.*`) — any of them grants entry. */
function permissionsFor(prefix: string): Permission[] {
  return PERMISSIONS.filter((p) => p.startsWith(`${prefix}.`));
}

/**
 * The module registry, in display order. Dashboard is ungated (every authenticated user lands
 * somewhere); each module module is gated by its permission namespace; Admin & Access is
 * bottom-anchored and super-admin only. Paths here define the route tree.
 */
export const MODULES: ModuleDescriptor[] = [
  {
    key: "dashboard",
    path: "/",
    titleKey: "nav.dashboard",
    icon: LayoutDashboard,
    section: "primary",
  },
  {
    key: "inventory",
    path: "/inventory",
    titleKey: "nav.inventory",
    icon: Boxes,
    permissions: permissionsFor("inventory"),
    section: "primary",
  },
  {
    key: "production",
    path: "/production",
    titleKey: "nav.production",
    icon: Factory,
    permissions: permissionsFor("production"),
    kiosk: true,
    section: "primary",
  },
  {
    key: "sales",
    path: "/sales",
    titleKey: "nav.sales",
    icon: ReceiptText,
    permissions: permissionsFor("sales"),
    section: "primary",
  },
  {
    key: "hr",
    path: "/hr",
    titleKey: "nav.hr",
    icon: Users,
    permissions: permissionsFor("hr"),
    section: "primary",
  },
  {
    key: "reports",
    path: "/reports",
    titleKey: "nav.reports",
    icon: BarChart3,
    permissions: permissionsFor("report"),
    section: "primary",
  },
  {
    key: "admin",
    path: "/admin",
    titleKey: "nav.admin",
    icon: ShieldCheck,
    permissions: permissionsFor("iam"),
    superAdminOnly: true,
    section: "admin",
  },
];
