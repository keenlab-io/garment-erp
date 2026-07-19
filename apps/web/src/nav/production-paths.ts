/**
 * Production Tracking route paths, explicitly typed `string` (not a literal) — same rationale as
 * `hr-paths.ts`/`inventory-paths.ts`: `PRODUCTION_ROUTES`' `path` field is `string` too
 * (route-tree.tsx generates its routes generically from that array), so TanStack Router's
 * `Link`/`navigate` never registers these as path literals. Screens that need to link back to a
 * list page (M4 §4) import these instead of writing the path inline.
 */
export const PRODUCTION_TIMELINE_PATH: string = "/production/timeline";
export const PRODUCTION_WORK_ORDERS_PATH: string = "/production/work-orders";
export const PRODUCTION_SCAN_PATH: string = "/production/scan";
export const PRODUCTION_WIP_PATH: string = "/production/wip";
export const PRODUCTION_SUBCONTRACTS_PATH: string = "/production/subcontracts";
