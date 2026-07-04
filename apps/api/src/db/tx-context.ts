import { AsyncLocalStorage } from "node:async_hooks";
import type { Db, Tx } from "@erp/db";

/**
 * Context carried through the async call tree for the lifetime of one transaction.
 * `onCommit` hooks flush only after COMMIT; `correlationId` ties emitted domain
 * events back to the transaction that produced them (M0 design D3).
 */
export interface TxStore {
  tx: Tx;
  onCommit: Array<() => Promise<void> | void>;
  correlationId: string;
}

export const txContext = new AsyncLocalStorage<TxStore>();

/**
 * The executor a query should run on: the active transaction when inside one,
 * otherwise the pool. Lets services and event handlers write in the caller's tx
 * without threading a `tx` handle through every signature.
 */
export const currentExecutor = (db: Db): Db | Tx => txContext.getStore()?.tx ?? db;

/**
 * Register a hook to run after the current transaction commits. Called outside a
 * transaction, it runs immediately (fire-and-forget).
 */
export function onCommit(fn: () => Promise<void> | void): void {
  const store = txContext.getStore();
  if (store) {
    store.onCommit.push(fn);
  } else {
    void fn();
  }
}
