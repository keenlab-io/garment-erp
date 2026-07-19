/**
 * Sales route paths, explicitly typed `string` (not a literal) — same rationale as
 * `hr-paths.ts`/`inventory-paths.ts`/`production-paths.ts`: `SALES_ROUTES`' `path` field is
 * `string` too (route-tree.tsx generates its routes generically from that array), so TanStack
 * Router's `Link`/`navigate` never registers these as path literals. Screens that need to link
 * back to a list page (M5 §4) import these instead of writing the path inline.
 */
export const SALES_DOCUMENTS_PATH: string = "/sales/documents";
export const SALES_CUSTOMERS_PATH: string = "/sales/customers";
export const SALES_PAYMENTS_PATH: string = "/sales/payments";
export const SALES_TEMPLATES_PATH: string = "/sales/templates";
export const SALES_AGING_PATH: string = "/sales/aging";
