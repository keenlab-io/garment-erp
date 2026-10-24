import { Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";

/** The label every sunk message carries, so the UI renders it as a demo send (task 6.4). */
export const DEMO_NOT_DELIVERED = "demo — not delivered";

/** The egress channels a sandbox's messages are sunk from (`demo-guardrails` spec). */
export type DemoSinkChannel = "email" | "line";

/** A would-be outbound message: who it was for, and what it said (or references to it). */
export interface SunkMessage {
  channel: DemoSinkChannel;
  to: string[];
  subject?: string;
  text?: string;
  /** References to the body/attachments (filenames, storage keys) — never the bytes. */
  attachments?: string[];
}

/** What a sunk send returns: the recorded message, labelled as a demo send. */
export interface SunkMessageRecord extends SunkMessage {
  delivered: false;
  demo: true;
  label: typeof DEMO_NOT_DELIVERED;
}

/**
 * The demo egress sink (M10 §5, design D7). A sandbox's email and LINE sends end here instead of
 * at nodemailer or the LINE API: the would-be message is written to the sink log and to the
 * sandbox's own `audit_log` (`entity_type = demo.sunk_<channel>`, the message in `after`), so the
 * demo still *shows* what would have been sent — it just never leaves the building. The audit row
 * dies with the sandbox's purge, so the recipient addresses do too.
 */
@Injectable()
export class DemoSinkService {
  private readonly logger = new Logger(DemoSinkService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly uow: UnitOfWork,
  ) {}

  async record(message: SunkMessage): Promise<SunkMessageRecord> {
    this.logger.log(
      `sunk demo ${message.channel} to ${message.to.length} recipient(s)` +
        (message.subject ? `: ${message.subject}` : ""),
    );
    await this.uow.withTransaction(() =>
      this.audit.record({
        action: "CREATE",
        entityType: `demo.sunk_${message.channel}`,
        after: message,
        reason: DEMO_NOT_DELIVERED,
      }),
    );
    return { ...message, delivered: false, demo: true, label: DEMO_NOT_DELIVERED };
  }
}
