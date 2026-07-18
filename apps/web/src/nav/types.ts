import type { LucideIcon } from "lucide-react";
import type { Permission } from "@erp/contracts";
import type { ShellKey } from "../i18n/keys";

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
