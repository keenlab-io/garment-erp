/**
 * Inventory & Costing route paths, explicitly typed `string` (not a literal) — same rationale as
 * `hr-paths.ts`: `INVENTORY_ROUTES`' `path` field is `string` too (route-tree.tsx generates its
 * routes generically from that array), so TanStack Router's `Link`/`navigate` never registers
 * these as path literals. Screens that need to link back to a list page (M3 §4) import these
 * instead of writing the path inline.
 */
export const INVENTORY_ITEMS_PATH: string = "/inventory/items";
export const INVENTORY_RECEIPTS_PATH: string = "/inventory/receipts";
export const INVENTORY_ISSUES_PATH: string = "/inventory/issues";
export const INVENTORY_COUNTS_PATH: string = "/inventory/counts";
export const INVENTORY_ADJUSTMENTS_PATH: string = "/inventory/adjustments";
export const INVENTORY_BARCODES_PATH: string = "/inventory/barcodes";
export const INVENTORY_REPORTS_PATH: string = "/inventory/reports";
