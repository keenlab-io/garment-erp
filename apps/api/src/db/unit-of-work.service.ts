import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Db, Tx } from "@erp/db";
import { DB } from "./db.tokens.js";
import { txContext, type TxStore } from "./tx-context.js";

/**
 * Transaction boundary. `withTransaction` opens a drizzle transaction and publishes
 * it into the `txContext` ALS frame, so nested calls join the caller's tx and any
 * synchronous event handler fired inside picks up the active tx via
 * `currentExecutor`. Registered `onCommit` hooks flush only after the tx commits
 * (after-commit dispatch — M0 design D3).
 */
@Injectable()
export class UnitOfWork {
  constructor(@Inject(DB) private readonly db: Db) {}

  async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const existing = txContext.getStore();
    if (existing) return fn(existing.tx); // nested → join caller's tx

    const onCommit: TxStore["onCommit"] = [];
    const correlationId = randomUUID();

    const result = await this.db.transaction((tx) =>
      txContext.run({ tx, onCommit, correlationId }, () => fn(tx)),
    );

    // Async dispatch only after COMMIT, so consumers never see uncommitted state.
    for (const hook of onCommit) await hook();
    return result;
  }
}
