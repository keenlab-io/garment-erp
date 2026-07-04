import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import type { DomainEvent } from "../events/domain-event.js";
import { AuditService, type AuditEntry } from "./audit.service.js";

/** A domain-event payload that opts into audit logging carries an `audit` block. */
interface AuditablePayload {
  audit?: AuditEntry;
}

/**
 * Listens to every domain event (`**`) and appends an `audit_log` row for any whose
 * payload carries an `audit` block. Runs synchronously in the emitter's frame, so
 * when dispatched via `publishInTransaction` the write joins the active tx (M0
 * design D3).
 */
@Injectable()
export class AuditSubscriber {
  constructor(private readonly audit: AuditService) {}

  @OnEvent("**")
  async handle(event: DomainEvent): Promise<void> {
    const block = (event.payload as AuditablePayload | null | undefined)?.audit;
    if (!block) return;
    await this.audit.record({
      ...block,
      actorUserId: block.actorUserId ?? event.actor_user_id,
    });
  }
}
