// Enum string-unions for `$type<...>()` column typing. `@erp/db` must NOT import
// `@erp/contracts` (M0 design D1), so these duplicate the enums in
// `packages/contracts/src/enums/iam.ts`. A compile-time parity test (task 5.5)
// keeps the two in lockstep — any drift fails the build.

// Account lifecycle. New users default to PENDING; login requires ACTIVE.
export type UserStatus = "PENDING" | "ACTIVE" | "DISABLED";

// Action recorded on each audit_log row.
export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "PERMISSION_CHANGE"
  | "APPROVE"
  | "VOID";
