import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Db, Tx } from "@erp/db";
import { currentTenantId, isTenantId } from "../tenancy/tenant-context.js";
import { DB } from "./db.tokens.js";
import { txContext, type TxStore } from "./tx-context.js";

/**
 * Transaction boundary. `withTransaction` opens a drizzle transaction and publishes
 * it into the `txContext` ALS frame, so nested calls join the caller's tx and any
 * synchronous event handler fired inside picks up the active tx via
 * `currentExecutor`. Registered `onCommit` hooks flush only after the tx commits
 * (after-commit dispatch — M0 design D3).
 *
 * Tenancy (M7 design D3/D4): the first statement of every transaction it opens sets the
 * transaction-local `app.tenant_id` GUC from the ambient `tenantContext`, bound as a parameter
 * (never spliced). No tenant in scope → no GUC, which RLS reads as "no rows" (fail-closed).
 */
@Injectable()
export class UnitOfWork {
  constructor(@Inject(DB) private readonly db: Db) {}

  async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const existing = txContext.getStore();
    if (existing) return fn(existing.tx); // nested → join caller's tx

    const onCommit: TxStore["onCommit"] = [];
    const correlationId = randomUUID();

    const tenantId = currentTenantId();
    if (tenantId !== null && !isTenantId(tenantId)) {
      throw new Error("Refusing to open a transaction: tenant id in scope is not a uuid");
    }

    const result = await this.db.transaction(async (tx) => {
      if (tenantId !== null) {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
      }
      return txContext.run({ tx, onCommit, correlationId }, () => fn(tx));
    });

    // Async dispatch only after COMMIT, so consumers never see uncommitted state.
    for (const hook of onCommit) await hook();
    return result;
  }
}
