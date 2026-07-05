import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { onCommit } from "../db/tx-context.js";
import type { DomainEvent } from "./domain-event.js";

/**
 * Publishes domain events with two dispatch semantics (M0 design D3):
 * - `publishInTransaction` awaits handlers inside the current tx, so a throwing
 *   handler (e.g. the audit writer) rolls the mutation back — atomicity.
 * - `publishAfterCommit` defers dispatch to an `onCommit` hook, so async consumers
 *   (BullMQ enqueues, notifications) never observe uncommitted state.
 */
@Injectable()
export class EventBusService {
  constructor(private readonly emitter: EventEmitter2) {}

  async publishInTransaction(event: DomainEvent): Promise<void> {
    await this.emitter.emitAsync(event.event, event);
  }

  publishAfterCommit(event: DomainEvent): void {
    onCommit(async () => {
      await this.emitter.emitAsync(event.event, event);
    });
  }
}
