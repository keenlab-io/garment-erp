import type { Permission } from "@erp/contracts";
import type { ShellKey, IamKey, HrKey, InventoryKey, ProductionKey } from "../i18n/keys";

// Types the per-route `staticData` the shell reads generically via useMatches: breadcrumb/title,
// the kiosk density flag, the entry permissions, and a back-reference into the nav registry.
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** i18n key (shell:nav / shell:… ) for the page title and breadcrumb leaf — typed (M0 §7.2). */
    title?: ShellKey | IamKey | HrKey | InventoryKey | ProductionKey;
    /** Override key when the breadcrumb label differs from the title. */
    breadcrumb?: ShellKey | IamKey | HrKey | InventoryKey | ProductionKey;
    /** Floor/kiosk route → forces Touch density, non-overridable. */
    kiosk?: boolean;
    /** Permissions (any-of) required to enter the route. */
    permissions?: Permission[];
    /** Back-reference into the nav registry (icon/section live there). */
    navKey?: string;
  }
}
