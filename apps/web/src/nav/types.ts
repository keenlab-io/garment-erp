import type { LucideIcon } from "lucide-react";
import type { Permission } from "@erp/contracts";
import type {
  ShellKey,
  IamKey,
  HrKey,
  InventoryKey,
  ProductionKey,
  SalesKey,
  ReportingKey,
} from "../i18n/keys";

/**
 * One navigable module. This descriptor is the single source of truth: the route tree spreads it
 * into route metadata, and the sidebar, mobile tab bar, drawer, and command palette all render from
 * the same array — so navigation, routing, and the palette can never drift.
 */
export interface ModuleDescriptor {
  /** Stable id (used as a React key and route-metadata back-reference). */
  key: string;
  /** Route path. */
  path: string;
  /** i18n key under the `shell:nav` namespace — typed, so a typo fails typecheck (M0 §7.2). */
  titleKey: Extract<ShellKey, `nav.${string}`>;
  /** Nav glyph (lucide component passed to `@erp/ui`'s `Icon`). */
  icon: LucideIcon;
  /**
   * Permissions that grant entry (any-of). Absent = visible to every authenticated user. A user
   * with none of these — and not a super admin — never sees the module (absent, not disabled).
   */
  permissions?: Permission[];
  /** Only super admins see this module (e.g. Admin & Access). */
  superAdminOnly?: boolean;
  /** Floor/kiosk module → its route forces Touch density. */
  kiosk?: boolean;
  /** `primary` = main sidebar list; `admin` = bottom-anchored. */
  section: "primary" | "admin";
}

/**
 * A Super-Admin-only sub-route inside the Admin & Access module (Users/Roles/Audit/Import lists).
 * Drives both its TanStack route registration and its Cmd/Ctrl-K palette entry. Kept separate from
 * `ModuleDescriptor` because these aren't top-level sidebar items — the Admin & Access sidebar entry
 * still points at `/admin`; these are reached via the palette until M1's screens (§4) link them.
 */
export interface AdminRouteDescriptor {
  /** Stable id (React key and route-metadata back-reference). */
  key: string;
  /** Route path. */
  path: string;
  /** i18n key in the `iam` namespace — typed, so a typo fails typecheck. */
  titleKey: IamKey;
  /** Nav glyph (lucide component passed to `@erp/ui`'s `Icon`). */
  icon: LucideIcon;
  /** The specific iam.* permission(s) that grant entry (any-of), on top of the Super-Admin gate. */
  permissions: Permission[];
}

/**
 * An HR & Payroll sub-route (Employees/OT/Cash advances/Attendance/Payroll/Tax exports — M2 §1).
 * Kept separate from `ModuleDescriptor` for the same reason as `AdminRouteDescriptor`: these
 * aren't top-level sidebar items — the HR & Payroll sidebar entry still points at `/hr` — they're
 * reached via the palette until M2's screens (§4) link them. Unlike `AdminRouteDescriptor`, entry
 * is gated by each route's own `hr.*` permission(s), not a blanket Super-Admin requirement.
 */
export interface HrRouteDescriptor {
  /** Stable id (React key and route-metadata back-reference). */
  key: string;
  /** Route path. */
  path: string;
  /** i18n key in the `hr` namespace — typed, so a typo fails typecheck. */
  titleKey: HrKey;
  /** Nav glyph (lucide component passed to `@erp/ui`'s `Icon`). */
  icon: LucideIcon;
  /** The specific hr.* permission(s) that grant entry (any-of). */
  permissions: Permission[];
}

/**
 * An Inventory & Costing sub-route (Items/Receipts/Issues/Counts/Adjustments/Barcodes/Reports —
 * M3 §1). Kept separate from `ModuleDescriptor` for the same reason as `HrRouteDescriptor`: these
 * aren't top-level sidebar items — the Inventory sidebar entry still points at `/inventory` —
 * they're reached via the palette until M3's screens (§4) link them. Entry is gated by each
 * route's own `inventory.*` permission(s), matching the `apps/api` handler(s) it fronts.
 */
export interface InventoryRouteDescriptor {
  /** Stable id (React key and route-metadata back-reference). */
  key: string;
  /** Route path. */
  path: string;
  /** i18n key in the `inventory` namespace — typed, so a typo fails typecheck. */
  titleKey: InventoryKey;
  /** Nav glyph (lucide component passed to `@erp/ui`'s `Icon`). */
  icon: LucideIcon;
  /** The specific inventory.* permission(s) that grant entry (any-of). */
  permissions: Permission[];
  /** Scan-heavy route (e.g. goods issue) → forces Touch density, non-overridable (FD11). */
  kiosk?: boolean;
}

/**
 * A Production Tracking sub-route (Timeline/Work orders/Scan station/WIP board/Subcontracts —
 * M4 §1). Kept separate from `ModuleDescriptor` for the same reason as `InventoryRouteDescriptor`:
 * these aren't top-level sidebar items — the Production sidebar entry still points at `/production`
 * — they're reached via the palette until M4's screens (§4) link them. Entry is gated by each
 * route's own `production.*` permission(s), matching the `apps/api` `ProductionController` handler(s)
 * it fronts.
 */
export interface ProductionRouteDescriptor {
  /** Stable id (React key and route-metadata back-reference). */
  key: string;
  /** Route path. */
  path: string;
  /** i18n key in the `production` namespace — typed, so a typo fails typecheck. */
  titleKey: ProductionKey;
  /** Nav glyph (lucide component passed to `@erp/ui`'s `Icon`). */
  icon: LucideIcon;
  /** The specific production.* permission(s) that grant entry (any-of). */
  permissions: Permission[];
  /** Scan-first floor route (design MD2) → forces Touch density, non-overridable (FD11). */
  kiosk?: boolean;
  /** Full kiosk lockdown (design MD2 "Kiosk lockdown") → shell chrome (nav/palette) is suppressed. */
  kioskLockdown?: boolean;
}

/**
 * A Sales sub-route (Documents worklist/Customers/Payments/Templates/Aging — M5 §1). Kept separate
 * from `ModuleDescriptor` for the same reason as `ProductionRouteDescriptor`: these aren't
 * top-level sidebar items — the Sales sidebar entry still points at `/sales` — they're reached via
 * the palette until M5's screens (§4) link them. Entry is gated by each route's own `sales.*` (or
 * `report.sales.view`) permission(s), matching the `apps/api` `SalesController` handler(s) it
 * fronts. The document editor (`/sales/documents/{id}/edit`) and the `{id}` detail routes have no
 * fixed nav/palette entry (the id varies) and are registered directly in the route tree.
 */
export interface SalesRouteDescriptor {
  /** Stable id (React key and route-metadata back-reference). */
  key: string;
  /** Route path. */
  path: string;
  /** i18n key in the `sales` namespace — typed, so a typo fails typecheck. */
  titleKey: SalesKey;
  /** Nav glyph (lucide component passed to `@erp/ui`'s `Icon`). */
  icon: LucideIcon;
  /** The specific `sales.*` (or `report.sales.view`) permission(s) that grant entry (any-of). */
  permissions: Permission[];
}

/**
 * A Reporting & Analytics sub-route — the five domain dashboards (`REPORTING_DASHBOARD_ROUTES`,
 * `/reports/dashboards/{group}`) and the schedules manager (`REPORTING_ROUTES`,
 * `/reports/schedules` — M6 §1). Kept separate from `ModuleDescriptor` for the same reason as
 * `SalesRouteDescriptor`: these aren't top-level sidebar items — the Reports sidebar entry still
 * points at `/reports` — they're reached via the palette until M6's screens (§4) link them. Each
 * domain dashboard is gated by its own `report.<group>.view` permission (cost/profit masking of
 * individual KPIs/panels for missing `inventory.cost.view` is display-only, design MD2, and
 * happens inside the screen, not at route entry); the schedules manager needs
 * `report.schedule.manage`. The report viewer (`/reports/{report_key}`) has no fixed nav/palette
 * entry (the catalog has 16 keys, browsed from the Reports module home instead) and is registered
 * directly in the route tree, gated dynamically per `report_key` via `requireReportAccess`.
 */
export interface ReportingRouteDescriptor {
  /** Stable id (React key and route-metadata back-reference). */
  key: string;
  /** Route path. */
  path: string;
  /** i18n key in the `reporting` namespace — typed, so a typo fails typecheck. */
  titleKey: ReportingKey;
  /** Nav glyph (lucide component passed to `@erp/ui`'s `Icon`). */
  icon: LucideIcon;
  /** The specific `report.*` permission(s) that grant entry (any-of). */
  permissions: Permission[];
}
