import { randomUUID } from "node:crypto";
import { txContext } from "../db/tx-context.js";

/**
 * Domain event envelope (M0 design D3). A `payload` carrying an `audit` block is
 * persisted by the `AuditSubscriber`. `correlation_id` defaults to the active
 * transaction's id so every event emitted from one unit of work shares it.
 */
export interface DomainEvent<P = unknown> {
  event: string;
  version: number;
  occurred_at: string;
  actor_user_id: string | null;
  payload: P;
  correlation_id: string;
}

export interface MakeEventInput<P> {
  event: string;
  payload: P;
  version?: number;
  actorUserId?: string | null;
  correlationId?: string;
}

/** Build a `DomainEvent`, defaulting `correlation_id` to the current tx's id. */
export function makeEvent<P>(input: MakeEventInput<P>): DomainEvent<P> {
  return {
    event: input.event,
    version: input.version ?? 1,
    occurred_at: new Date().toISOString(),
    actor_user_id: input.actorUserId ?? null,
    payload: input.payload,
    correlation_id:
      input.correlationId ?? txContext.getStore()?.correlationId ?? randomUUID(),
  };
}
