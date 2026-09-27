import { PERMISSIONS, isPermission, type MeTenant, type Permission } from "@erp/contracts";

/**
 * The authenticated user the shell reads. Real auth (login against the M1 IAM contract, token in
 * the api client's `baseHeaders`) lands with M1; M0 ships this shape and a dev stub.
 */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  /** Super admins bypass permission checks, mirroring the backend guard semantics. */
  isSuperAdmin: boolean;
  /** Granted permission codes (empty for a super admin — the bypass covers them). */
  permissions: Permission[];
  /**
   * The tenant the session belongs to, from `GET /auth/me` (M7 §14.2). Display-only — the api
   * reads tenant identity from the token's `tid` claim, never from anything the web sends. Absent
   * on the dev stub and test fixtures.
   */
  tenant?: MeTenant;
}

/**
 * Build the dev session. `VITE_DEV_PERMISSIONS` shapes it for demoing role-filtering:
 *   unset / "*"  → super admin (sees everything)
 *   "none"       → no permissions (nothing gated is visible)
 *   "a.b.c,d.e"  → exactly those permissions, not a super admin
 * Unknown codes are dropped (a typo shouldn't silently grant access).
 */
export function createDevUser(): AuthUser {
  const raw = (import.meta.env.VITE_DEV_PERMISSIONS as string | undefined)?.trim();

  const base = { id: "dev", name: "Dev User", email: "dev@example.com" };

  if (!raw || raw === "*") {
    return { ...base, isSuperAdmin: true, permissions: [] };
  }
  if (raw === "none") {
    return { ...base, isSuperAdmin: false, permissions: [] };
  }

  const permissions = raw
    .split(",")
    .map((code) => code.trim())
    .filter((code): code is Permission => isPermission(code));

  return { ...base, isSuperAdmin: false, permissions };
}

/** All catalog permissions — handy for a "grant everything without super-admin" dev session. */
export const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;
