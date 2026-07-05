import type { Permission } from "@erp/contracts";
import type { UserStatus } from "@erp/db";

/** Minimal user record the guard needs to authenticate a request. */
export interface AuthUserRecord {
  id: string;
  status: UserStatus;
  permissionsVersion: number;
  isSuperAdmin: boolean;
  lockedUntil: Date | null;
}

/** Minimal session record the guard needs to validate a token's session. */
export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenId: string;
  permissionsVersion: number;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Load a user by id; `null` if not found. */
export interface UserLookup {
  byId(id: string): Promise<AuthUserRecord | null>;
}

/** Load a session by its token id (jti); `null` if not found. */
export interface SessionLookup {
  byTokenId(tokenId: string): Promise<AuthSessionRecord | null>;
}

/**
 * Resolve the permission set for a user. M0's default returns the empty set, so
 * only super-admins pass permission checks. M1 rebinds this to the
 * role→permission union without touching any M0 code (design D6).
 */
export interface PermissionResolver {
  resolve(userId: string): Promise<ReadonlySet<Permission>>;
}

export const USER_LOOKUP = Symbol("USER_LOOKUP");
export const SESSION_LOOKUP = Symbol("SESSION_LOOKUP");
export const PERMISSION_RESOLVER = Symbol("PERMISSION_RESOLVER");
