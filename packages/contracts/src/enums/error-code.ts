// Canonical error codes (spec §14). Shared by web and the api exception filter:
// the filter maps each code → HTTP status and always emits { code, message, details }.
export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  STATE_CONFLICT: "STATE_CONFLICT",
  BUSINESS_RULE: "BUSINESS_RULE",
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
  IDEMPOTENT_REPLAY: "IDEMPOTENT_REPLAY",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const errorCodeSet = new Set<string>(Object.values(ErrorCode));

/** Type guard: is the given string a known error code? */
export function isErrorCode(value: string): value is ErrorCode {
  return errorCodeSet.has(value);
}
