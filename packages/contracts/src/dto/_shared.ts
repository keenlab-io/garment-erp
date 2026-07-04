import { z } from "zod";
import { ErrorCode } from "../enums/index.js";

/**
 * Shared DTO primitives (spec §13, §14) — API prefix, pagination, error envelope,
 * job-accepted, request headers, and the withErrors response helper. Every module
 * contract builds on these so the wire shape stays uniform across the API.
 */

/** Versioned API path prefix — the ts-rest contract pathPrefix (no Nest global prefix). */
export const API_PREFIX = "/api/v1";

/** A UUID string. */
export const uuid = z.string().uuid();

/** Query params for cursor pagination — limit coerced to 1–100 (default 50). */
export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/** A page of `item` values plus the opaque cursor for the next page (null at the end). */
export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    next_cursor: z.string().nullable(),
  });
}

/** Uniform error body emitted by the api exception filter. */
export const errorResponse = z.object({
  code: z.nativeEnum(ErrorCode),
  message: z.string(),
  details: z.array(
    z.object({
      field: z.string().optional(),
      issue: z.string(),
    }),
  ),
});

/** Body of a 202 for work handed off to the background queue. */
export const jobAccepted = z.object({ job_id: z.string() });

/** Idempotency-Key request header for at-most-once mutations. */
export const idempotencyKeyHeader = z.object({
  "idempotency-key": z.string().min(1),
});

/** If-Match request header carrying the expected version for optimistic concurrency. */
export const ifMatchHeader = z.object({
  "if-match": z.string().min(1),
});

/**
 * Merge the standard error responses (400/401/403/404/409/422 → errorResponse) onto a
 * route's responses. Errors are spread first so a caller's own status schemas win.
 */
export function withErrors<T extends Record<number, z.ZodTypeAny>>(responses: T) {
  return {
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    409: errorResponse,
    422: errorResponse,
    ...responses,
  };
}
