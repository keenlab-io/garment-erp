/**
 * HR & Payroll route paths, explicitly typed `string` (not a literal) — same rationale as
 * `admin-paths.ts`: `HR_ROUTES`' `path` field is `string` too (route-tree.tsx generates its routes
 * generically from that array), so TanStack Router's `Link`/`navigate` never registers these as
 * path literals. Screens that need to link back to a list page (M2 §4) import these instead of
 * writing the path inline.
 */
export const HR_EMPLOYEES_PATH: string = "/hr/employees";
export const HR_OT_PATH: string = "/hr/ot";
export const HR_ADVANCES_PATH: string = "/hr/advances";
export const HR_ATTENDANCE_PATH: string = "/hr/attendance";
export const HR_PAYROLL_PATH: string = "/hr/payroll";
export const HR_TAX_EXPORTS_PATH: string = "/hr/tax-exports";
