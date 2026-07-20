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
  FileText,
  UserRound,
  Wallet2,
  LayoutTemplate,
  Hourglass,
  Coins,
  TrendingUp,
  Percent,
  CalendarClock,
} from "lucide-react";
import { PERMISSIONS, ReportGroup, type Permission } from "@erp/contracts";
import type {
  AdminRouteDescriptor,
  HrRouteDescriptor,
  InventoryRouteDescriptor,
  ModuleDescriptor,
  NavChildDescriptor,
  ProductionRouteDescriptor,
  SalesRouteDescriptor,
  ReportingRouteDescriptor,
} from "./types";
import { reportDashboardPath, REPORTS_SCHEDULES_PATH } from "./reporting-paths";

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

/**
 * Sales sub-routes (Documents worklist/Customers/Payments/Templates/Aging — M5 §1). Each is gated
 * by the same `sales.*` (or `report.sales.view`) permission(s) its `apps/api` `SalesController`
 * handler(s) assert: the documents worklist covers both quotations (`sales.quotation.manage`) and
 * invoices (`sales.invoice.create`), customers `sales.customer.manage`, payments
 * `sales.payment.record`, the template designer reuses the document-management permissions (the
 * contract has no dedicated template permission yet), and the aging dashboard
 * `report.sales.view`. `/sales/documents/{id}`, `/sales/documents/{id}/edit`, and
 * `/sales/customers/{id}` have no fixed nav/palette entry (the id varies) and are registered
 * directly in the route tree.
 */
export const SALES_ROUTES: SalesRouteDescriptor[] = [
  {
    key: "sales-documents",
    path: "/sales/documents",
    titleKey: "sales:nav.documents",
    icon: FileText,
    permissions: ["sales.quotation.manage", "sales.invoice.create"],
  },
  {
    key: "sales-customers",
    path: "/sales/customers",
    titleKey: "sales:nav.customers",
    icon: UserRound,
    permissions: ["sales.customer.manage"],
  },
  {
    key: "sales-payments",
    path: "/sales/payments",
    titleKey: "sales:nav.payments",
    icon: Wallet2,
    permissions: ["sales.payment.record"],
  },
  {
    key: "sales-templates",
    path: "/sales/templates",
    titleKey: "sales:nav.templates",
    icon: LayoutTemplate,
    permissions: ["sales.quotation.manage", "sales.invoice.create"],
  },
  {
    key: "sales-aging",
    path: "/sales/aging",
    titleKey: "sales:nav.aging",
    icon: Hourglass,
    permissions: ["report.sales.view"],
  },
];

/**
 * Reporting & Analytics domain dashboards (M6 §1) — one per report-catalog group (design D4),
 * each gated by its own `report.<group>.view` permission, matching `apps/api`'s reporting
 * endpoints. Cost/profit dashboards don't require `inventory.cost.view` to *enter* — their
 * cost/profit KPIs and panels are individually masked without it (design MD2) — so the route
 * gate stays a single permission, same shape as every other module's sub-routes.
 */
export const REPORTING_DASHBOARD_ROUTES: ReportingRouteDescriptor[] = [
  {
    key: "reports-dashboard-inventory",
    path: reportDashboardPath(ReportGroup.INVENTORY.toLowerCase()),
    titleKey: "reporting:nav.dashboardInventory",
    icon: Boxes,
    permissions: ["report.inventory.view"],
  },
  {
    key: "reports-dashboard-sales",
    path: reportDashboardPath(ReportGroup.SALES.toLowerCase()),
    titleKey: "reporting:nav.dashboardSales",
    icon: ReceiptText,
    permissions: ["report.sales.view"],
  },
  {
    key: "reports-dashboard-cost",
    path: reportDashboardPath(ReportGroup.COST.toLowerCase()),
    titleKey: "reporting:nav.dashboardCost",
    icon: Coins,
    permissions: ["report.cost.view"],
  },
  {
    key: "reports-dashboard-profit",
    path: reportDashboardPath(ReportGroup.PROFIT.toLowerCase()),
    titleKey: "reporting:nav.dashboardProfit",
    icon: TrendingUp,
    permissions: ["report.profit.view"],
  },
  {
    key: "reports-dashboard-tax",
    path: reportDashboardPath(ReportGroup.TAX.toLowerCase()),
    titleKey: "reporting:nav.dashboardTax",
    icon: Percent,
    permissions: ["report.tax.view"],
  },
];

/**
 * Reporting & Analytics sub-routes with no natural place in the dashboard group above — currently
 * just the digest schedule manager (M6 §1), gated by `report.schedule.manage` per design MD5.
 */
export const REPORTING_ROUTES: ReportingRouteDescriptor[] = [
  {
    key: "reports-schedules",
    path: REPORTS_SCHEDULES_PATH,
    titleKey: "reporting:nav.schedules",
    icon: CalendarClock,
    permissions: ["report.schedule.manage"],
  },
];

/**
 * Sub-routes shown under each module in the expandable sidebar/drawer sub-nav. Keyed by
 * `ModuleDescriptor.key`; a module absent here (Dashboard) stays a plain link. Values reuse the same
 * `*_ROUTES` arrays the command palette and route tree consume — one source of truth, so nav, palette
 * and routes never drift. Reports leads with its catalog home (`/reports`, the real browse surface)
 * so expanding the group never hides it. Each child is permission-gated at render via `isModuleVisible`.
 */
export const MODULE_CHILDREN: Record<string, NavChildDescriptor[]> = {
  inventory: INVENTORY_ROUTES,
  production: PRODUCTION_ROUTES,
  sales: SALES_ROUTES,
  hr: HR_ROUTES,
  admin: ADMIN_ROUTES,
  reports: [
    {
      key: "reports-home",
      path: "/reports",
      titleKey: "reporting:home.reportsCatalog",
      icon: FileBarChart2,
      permissions: permissionsFor("report"),
    },
    ...REPORTING_DASHBOARD_ROUTES,
    ...REPORTING_ROUTES,
  ],
};
