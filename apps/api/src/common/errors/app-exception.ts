import { ErrorCode } from "@erp/contracts";

/** One field-level detail entry in the uniform error envelope. */
export interface ErrorDetail {
  field?: string;
  issue: string;
}

/**
 * Base application exception. Carries an `ErrorCode`, a client-safe message, and
 * optional field-level details. The global `AllExceptionsFilter` maps the code to
 * an HTTP status — handlers never construct error response bodies themselves.
 */
export class AppException extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppException {
  constructor(message = "Validation failed", details: ErrorDetail[] = []) {
    super(ErrorCode.VALIDATION_ERROR, message, details);
  }
}

export class UnauthenticatedError extends AppException {
  constructor(message = "Authentication required", details: ErrorDetail[] = []) {
    super(ErrorCode.UNAUTHENTICATED, message, details);
  }
}

export class ForbiddenError extends AppException {
  constructor(message = "Forbidden", details: ErrorDetail[] = []) {
    super(ErrorCode.FORBIDDEN, message, details);
  }
}

export class NotFoundError extends AppException {
  constructor(message = "Not found", details: ErrorDetail[] = []) {
    super(ErrorCode.NOT_FOUND, message, details);
  }
}

export class StateConflictError extends AppException {
  constructor(message = "State conflict", details: ErrorDetail[] = []) {
    super(ErrorCode.STATE_CONFLICT, message, details);
  }
}

export class BusinessRuleError extends AppException {
  constructor(message = "Business rule violation", details: ErrorDetail[] = []) {
    super(ErrorCode.BUSINESS_RULE, message, details);
  }
}

export class ReauthRequiredError extends AppException {
  constructor(message = "Re-authentication required", details: ErrorDetail[] = []) {
    super(ErrorCode.REAUTH_REQUIRED, message, details);
  }
}
