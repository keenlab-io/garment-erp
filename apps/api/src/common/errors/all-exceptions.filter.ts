import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
import { ErrorCode } from "@erp/contracts";
import { AppException, type ErrorDetail } from "./app-exception.js";

/** Code → HTTP status for thrown `AppException` subclasses. */
const CODE_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  STATE_CONFLICT: HttpStatus.CONFLICT,
  BUSINESS_RULE: HttpStatus.UNPROCESSABLE_ENTITY,
  REAUTH_REQUIRED: HttpStatus.UNAUTHORIZED,
  IDEMPOTENT_REPLAY: HttpStatus.OK,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** HTTP status → code for framework `HttpException`s that aren't `AppException`s. */
const STATUS_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.STATE_CONFLICT,
  422: ErrorCode.BUSINESS_RULE,
};

interface ErrorBody {
  code: ErrorCode;
  message: string;
  details: ErrorDetail[];
}

/**
 * Single global exception filter. Every failure — `AppException`, framework
 * `HttpException`, `ZodError`, Postgres unique violation, or unknown error — is
 * serialized to the uniform `{ code, message, details }` envelope (M0
 * error-handling spec). Unknown errors are logged with their stack and scrubbed
 * to a generic 500 so internal detail never leaks to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.resolve(exception);
    res.status(status).json(body);
  }

  private resolve(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof AppException) {
      return {
        status: CODE_STATUS[exception.code],
        body: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Validation failed",
          details: exception.issues.map((issue) => ({
            field: issue.path.join(".") || undefined,
            issue: issue.message,
          })),
        },
      };
    }

    if (isUniqueViolation(exception)) {
      return {
        status: HttpStatus.CONFLICT,
        body: {
          code: ErrorCode.STATE_CONFLICT,
          message: "Resource already exists",
          details: [],
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: {
          code: STATUS_CODE[status] ?? ErrorCode.INTERNAL,
          message: exception.message,
          details: [],
        },
      };
    }

    // Unknown → log the original (with stack) server-side, return a scrubbed 500.
    this.logger.error(
      exception instanceof Error
        ? (exception.stack ?? exception.message)
        : String(exception),
    );
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: ErrorCode.INTERNAL,
        message: "Internal server error",
        details: [],
      },
    };
  }
}

/**
 * Postgres unique-constraint violation (SQLSTATE 23505). postgres.js surfaces the
 * SQLSTATE on the error's `code` property.
 */
function isUniqueViolation(exception: unknown): boolean {
  return (
    typeof exception === "object" &&
    exception !== null &&
    "code" in exception &&
    (exception as { code?: unknown }).code === "23505"
  );
}
