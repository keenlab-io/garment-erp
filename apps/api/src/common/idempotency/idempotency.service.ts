import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { idempotencyKey, type Db } from "@erp/db";
import { DB } from "../../db/db.tokens.js";
import { currentExecutor } from "../../db/tx-context.js";
import { StateConflictError } from "../errors/app-exception.js";

/** A response captured for at-most-once replay. */
export interface StoredResponse {
  status: number;
  body: unknown;
}

/** Idempotency record lifetime (24h). Expired records are treated as first use. */
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Backs the `IdempotencyInterceptor` (M0 idempotency spec). Records are keyed per
 * `(key, userId)`: an exact replay returns the stored response, a key reused with a
 * different request hash is a 409 conflict, and an expired record is discarded so
 * the request runs as first use.
 */
@Injectable()
export class IdempotencyService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Stable hash of the request payload, used to detect key reuse with a new body. */
  hashRequest(payload: unknown): string {
    return createHash("sha256")
      .update(JSON.stringify(payload ?? null))
      .digest("hex");
  }

  /**
   * Look up a live record for `(key, userId)`. Returns the stored response for an
   * exact replay, throws 409 on a request-hash mismatch, or `null` for first use
   * (including an expired record, which is deleted).
   */
  async lookup(
    key: string,
    userId: string,
    requestHash: string,
  ): Promise<StoredResponse | null> {
    const executor = currentExecutor(this.db);
    const rows = await executor
      .select()
      .from(idempotencyKey)
      .where(and(eq(idempotencyKey.key, key), eq(idempotencyKey.userId, userId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    if (row.expiresAt.getTime() <= Date.now()) {
      await executor
        .delete(idempotencyKey)
        .where(
          and(eq(idempotencyKey.key, key), eq(idempotencyKey.userId, userId)),
        );
      return null;
    }

    if (row.requestHash !== requestHash) {
      throw new StateConflictError(
        "Idempotency-Key reused with a different request",
      );
    }

    if (row.responseStatus === null) return null;
    return { status: row.responseStatus, body: row.responseBody };
  }

  /** Persist the response for `(key, userId)` with a fresh expiry. */
  async store(
    key: string,
    userId: string,
    requestHash: string,
    response: StoredResponse,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + TTL_MS);
    await currentExecutor(this.db)
      .insert(idempotencyKey)
      .values({
        key,
        userId,
        requestHash,
        responseStatus: response.status,
        responseBody: response.body,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [idempotencyKey.key, idempotencyKey.userId],
        set: {
          requestHash,
          responseStatus: response.status,
          responseBody: response.body,
          expiresAt,
        },
      });
  }
}
