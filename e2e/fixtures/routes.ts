/**
 * Leaf screen routes, mirrored from apps/web/src/nav/registry.ts (the single source of truth for
 * nav + palette + route tree). KEEP IN SYNC with the registry — the smoke spec asserts every one
 * renders for a super-admin. `$id` detail routes are omitted (they need real seeded ids; cover them
 * in the per-module golden-path specs). The kiosk-lockdown scan route is included but flagged.
 */
export interface RouteEntry {
  path: string;
  /** Registry navKey, for traceability back to registry.ts. */
  navKey: string;
  /** True for kiosk routes that force Touch density; scan additionally strips the app chrome. */
  kiosk?: boolean;
  kioskLockdown?: boolean;
}

export const SMOKE_ROUTES: RouteEntry[] = [
  { path: "/", navKey: "dashboard" },

  { path: "/inventory/items", navKey: "inventory-items" },
  { path: "/inventory/receipts", navKey: "inventory-receipts" },
  { path: "/inventory/issues", navKey: "inventory-issues", kiosk: true },
  { path: "/inventory/counts", navKey: "inventory-counts" },
  { path: "/inventory/adjustments", navKey: "inventory-adjustments" },
  { path: "/inventory/barcodes", navKey: "inventory-barcodes" },
  { path: "/inventory/reports", navKey: "inventory-reports" },

  { path: "/production/timeline", navKey: "production-timeline" },
  { path: "/production/work-orders", navKey: "production-work-orders" },
  { path: "/production/scan", navKey: "production-scan", kiosk: true, kioskLockdown: true },
  { path: "/production/wip", navKey: "production-wip" },
  { path: "/production/subcontracts", navKey: "production-subcontracts" },

  { path: "/sales/documents", navKey: "sales-documents" },
  { path: "/sales/customers", navKey: "sales-customers" },
  { path: "/sales/payments", navKey: "sales-payments" },
  { path: "/sales/templates", navKey: "sales-templates" },
  { path: "/sales/aging", navKey: "sales-aging" },

  { path: "/hr/employees", navKey: "hr-employees" },
  { path: "/hr/org", navKey: "hr-org" },
  { path: "/hr/ot", navKey: "hr-ot" },
  { path: "/hr/advances", navKey: "hr-advances" },
  { path: "/hr/attendance", navKey: "hr-attendance" },
  { path: "/hr/payroll", navKey: "hr-payroll" },
  { path: "/hr/tax-exports", navKey: "hr-tax-exports" },

  { path: "/reports", navKey: "reports-home" },
  { path: "/reports/dashboards/inventory", navKey: "reports-dashboard-inventory" },
  { path: "/reports/dashboards/sales", navKey: "reports-dashboard-sales" },
  { path: "/reports/dashboards/cost", navKey: "reports-dashboard-cost" },
  { path: "/reports/dashboards/profit", navKey: "reports-dashboard-profit" },
  { path: "/reports/dashboards/tax", navKey: "reports-dashboard-tax" },
  { path: "/reports/schedules", navKey: "reports-schedules" },

  { path: "/admin/users", navKey: "admin-users" },
  { path: "/admin/roles", navKey: "admin-roles" },
  { path: "/admin/audit", navKey: "admin-audit" },
  { path: "/admin/import", navKey: "admin-import" },
];
