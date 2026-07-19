/**
 * Admin & Access list-route paths, explicitly typed `string` (not a literal). `ADMIN_ROUTES`'
 * `path` field is `string` too (route-tree.tsx generates its routes generically from that array),
 * so TanStack Router's `Link`/`navigate` never registers these as path literals — passing a literal
 * string here would fail typecheck against the router's literal union. Screens that need to link
 * back to a list page (M1 §4.2–4.5) import these instead of writing the path inline.
 */
export const ADMIN_USERS_PATH: string = "/admin/users";
export const ADMIN_ROLES_PATH: string = "/admin/roles";
export const ADMIN_AUDIT_PATH: string = "/admin/audit";
export const ADMIN_IMPORT_PATH: string = "/admin/import";
