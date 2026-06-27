// Permission catalog — single source of truth (spec §1, §5.2).
// Both api (authorization guards) and web (UI gating) import these exact strings.
export const PERMISSIONS = [
  "inventory.product.create",
  "inventory.cost.view",
  "sales.invoice.approve",
  "iam.user.force_logout",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const permissionSet = new Set<string>(PERMISSIONS);

/** Type guard: is the given string a known permission? */
export function isPermission(value: string): value is Permission {
  return permissionSet.has(value);
}
