// IAM enums needed by the M0 audit layer (spec §1). The rest of the IAM enums land
// in M1. Keep these in sync with @erp/db/schema/enums.ts (parity is asserted by test).

// Account lifecycle. Login is rejected unless the user is ACTIVE; new users default to
// PENDING. Lockout is tracked separately via the user's lockedUntil field, not here.
export const UserStatus = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

// Action recorded on each audit_log row. PERMISSION_CHANGE covers authz mutations;
// APPROVE/VOID cover the audit spec's "sensitive actions".
export const AuditAction = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  PERMISSION_CHANGE: "PERMISSION_CHANGE",
  APPROVE: "APPROVE",
  VOID: "VOID",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
