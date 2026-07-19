import {
  LayoutDashboard,
  Boxes,
  Factory,
  ReceiptText,
  Users,
  BarChart3,
  ShieldCheck,
  KeyRound,
  ScrollText,
  Upload,
  IdCard,
  Clock,
  Wallet,
  CalendarCheck,
  Banknote,
  FileSpreadsheet,
  Package,
  PackageCheck,
  PackageMinus,
  ClipboardList,
  SlidersHorizontal,
  Barcode,
  FileBarChart2,
  GanttChartSquare,
  ScanLine,
  Layers3,
  Handshake,
} from "lucide-react";
import { PERMISSIONS, type Permission } from "@erp/contracts";
import type {
  AdminRouteDescriptor,
  HrRouteDescriptor,
  InventoryRouteDescriptor,
  ModuleDescriptor,
  ProductionRouteDescriptor,
} from "./types";

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
    // Only the scan-station sub-route is a kiosk (design MD2) — the timeline command center is a
    // desktop screen, so the module entry itself doesn't force Touch (M4 §1.1, PRODUCTION_ROUTES).
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

/**
 * Admin & Access sub-routes — Users, Roles, Audit log, Import (the list-level screens; the
 * `/admin/users/{id}` and `/admin/roles/{id}` detail routes are registered directly in the route
 * tree, since a dynamic id has no fixed nav/palette entry). Every entry is Super-Admin-gated in
 * addition to its specific permission (`router/guards.ts` `requireRouteAccess`).
 */
export const ADMIN_ROUTES: AdminRouteDescriptor[] = [
  {
    key: "admin-users",
    path: "/admin/users",
    titleKey: "iam:nav.users",
    icon: Users,
    permissions: ["iam.user.manage"],
  },
  {
    key: "admin-roles",
    path: "/admin/roles",
    titleKey: "iam:nav.roles",
    icon: KeyRound,
    permissions: ["iam.role.manage"],
  },
  {
    key: "admin-audit",
    path: "/admin/audit",
    titleKey: "iam:nav.audit",
    icon: ScrollText,
    permissions: ["iam.audit.view"],
  },
  {
    key: "admin-import",
    path: "/admin/import",
    titleKey: "iam:nav.import",
    icon: Upload,
    permissions: ["iam.role.manage"],
  },
];

/**
 * HR & Payroll sub-routes (Employees/OT/Cash advances/Attendance/Payroll/Tax exports — M2 §1).
 * Each is gated by the same `hr.*` permission(s) its `apps/api` handlers assert, so a route the
 * user can't call is a route they never see. `/hr/employees/{id}` and `/hr/payroll/runs/{id}` have
 * no fixed nav/palette entry (the id varies) and are registered directly in the route tree.
 */
export const HR_ROUTES: HrRouteDescriptor[] = [
  {
    key: "hr-employees",
    path: "/hr/employees",
    titleKey: "hr:nav.employees",
    icon: IdCard,
    permissions: ["hr.employee.view", "hr.employee.manage"],
  },
  {
    key: "hr-ot",
    path: "/hr/ot",
    titleKey: "hr:nav.ot",
    icon: Clock,
    permissions: ["hr.ot.approve"],
  },
  {
    key: "hr-advances",
    path: "/hr/advances",
    titleKey: "hr:nav.advances",
    icon: Wallet,
    permissions: ["hr.employee.manage"],
  },
  {
    key: "hr-attendance",
    path: "/hr/attendance",
    titleKey: "hr:nav.attendance",
    icon: CalendarCheck,
    permissions: ["hr.employee.manage"],
  },
  {
    key: "hr-payroll",
    path: "/hr/payroll",
    titleKey: "hr:nav.payroll",
    icon: Banknote,
    permissions: ["hr.payroll.approve"],
  },
  {
    key: "hr-tax-exports",
    path: "/hr/tax-exports",
    titleKey: "hr:nav.taxExports",
    icon: FileSpreadsheet,
    permissions: ["hr.payroll.approve"],
  },
];

/**
 * Inventory & Costing sub-routes (Items/Receipts/Issues/Counts/Adjustments/Barcodes/Reports —
 * M3 §1). Each is gated by the same `inventory.*` permission(s) its `apps/api` handler(s) assert,
 * matching `inventory.controller.ts`. `/inventory/items/{id}`, `/inventory/receipts/{id}`, and
 * `/inventory/counts/{id}` have no fixed nav/palette entry (the id varies) and are registered
 * directly in the route tree. Goods issue is scan-first on a handheld (design MD2), so its route
 * carries `kiosk: true` — Touch density auto-applies there, non-overridable (FD11).
 */
export const INVENTORY_ROUTES: InventoryRouteDescriptor[] = [
  {
    key: "inventory-items",
    path: "/inventory/items",
    titleKey: "inventory:nav.items",
    icon: Package,
    permissions: ["inventory.product.create"],
  },
  {
    key: "inventory-receipts",
    path: "/inventory/receipts",
    titleKey: "inventory:nav.receipts",
    icon: PackageCheck,
    permissions: ["inventory.receipt.manage"],
  },
  {
    key: "inventory-issues",
    path: "/inventory/issues",
    titleKey: "inventory:nav.issues",
    icon: PackageMinus,
    permissions: ["inventory.issue.manage"],
    kiosk: true,
  },
  {
    key: "inventory-counts",
    path: "/inventory/counts",
    titleKey: "inventory:nav.counts",
    icon: ClipboardList,
    permissions: ["inventory.issue.manage"],
  },
  {
    key: "inventory-adjustments",
    path: "/inventory/adjustments",
    titleKey: "inventory:nav.adjustments",
    icon: SlidersHorizontal,
    permissions: ["inventory.issue.manage", "inventory.adjustment.approve"],
  },
  {
    key: "inventory-barcodes",
    path: "/inventory/barcodes",
    titleKey: "inventory:nav.barcodes",
    icon: Barcode,
    permissions: ["inventory.product.create"],
  },
  {
    key: "inventory-reports",
    path: "/inventory/reports",
    titleKey: "inventory:nav.reports",
    icon: FileBarChart2,
    permissions: ["inventory.issue.manage", "inventory.cost.view"],
  },
];

/**
 * Production Tracking sub-routes (Timeline/Work orders/Scan station/WIP board/Subcontracts —
 * M4 §1). Each is gated by the same `production.*` permission(s) its `apps/api` handler(s) assert,
 * matching `production.controller.ts`: routing/work-order/WIP reads need `production.wo.manage`,
 * the scan station `production.scan`, subcontracts `production.subcontract.manage`.
 * `/production/work-orders/{id}` has no fixed nav/palette entry (the id varies) and is registered
 * directly in the route tree. The scan station is a floor kiosk (design MD2), so its route carries
 * `kiosk: true` — Touch density auto-applies there, non-overridable (FD11) — and `kioskLockdown:
 * true`, which suppresses the sidebar/top bar/tab bar/drawer/palette entirely (design MD2 "no
 * nav/menus"; `AppChrome` reads it). No other production route sets either flag, since the
 * timeline/work-orders/WIP/subcontract screens are desktop-first.
 */
export const PRODUCTION_ROUTES: ProductionRouteDescriptor[] = [
  {
    key: "production-timeline",
    path: "/production/timeline",
    titleKey: "production:nav.timeline",
    icon: GanttChartSquare,
    permissions: ["production.wo.manage"],
  },
  {
    key: "production-work-orders",
    path: "/production/work-orders",
    titleKey: "production:nav.workOrders",
    icon: ClipboardList,
    permissions: ["production.wo.manage"],
  },
  {
    key: "production-scan",
    path: "/production/scan",
    titleKey: "production:nav.scan",
    icon: ScanLine,
    permissions: ["production.scan"],
    kiosk: true,
    kioskLockdown: true,
  },
  {
    key: "production-wip",
    path: "/production/wip",
    titleKey: "production:nav.wip",
    icon: Layers3,
    permissions: ["production.wo.manage"],
  },
  {
    key: "production-subcontracts",
    path: "/production/subcontracts",
    titleKey: "production:nav.subcontracts",
    icon: Handshake,
    permissions: ["production.subcontract.manage"],
  },
];
