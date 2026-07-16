import type { AuthUser } from "../auth/auth-user.js";

/**
 * Field-level salary gating (design D7, spec §2.8). A caller without `hr.salary.view`
 * (and not a super-admin) must see monetary/PII fields **omitted entirely** — the keys are
 * deleted, never nulled-then-shown. Contract response schemas model those fields `optional`
 * so the gated shape still validates.
 */

/** True when the user may see salary/PII fields (`hr.salary.view`, or super-admin). */
export function canViewSalary(user: AuthUser): boolean {
  return user.isSuperAdmin || user.permissions.has("hr.salary.view");
}

/**
 * Return `record` with the given `keys` deleted when the user cannot view salary. The
 * caller keeps the field list next to the DTO so exactly the gated keys are stripped;
 * a permitted user gets the record unchanged.
 */
export function gateSalaryFields<T extends object>(
  user: AuthUser,
  record: T,
  keys: (keyof T)[],
): T {
  if (canViewSalary(user)) return record;
  const copy = { ...record };
  for (const key of keys) delete copy[key];
  return copy;
}
