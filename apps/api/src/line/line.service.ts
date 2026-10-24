import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { DemoGuardService } from "../demo/demo-guard.service.js";
import { DemoSinkService, type SunkMessageRecord } from "../demo/demo-sink.service.js";
import { QUEUES } from "../queue/queue.constants.js";
import { tenantJobData, type TenantJobData } from "../tenancy/with-tenant-job.js";

/** `line`-queue job name — one push message to a LINE recipient. */
export const LINE_PUSH_JOB = "line.push";

/** A LINE message to send: the recipient (a LINE user/group id) and the composed text. */
export interface LineMessage {
  to: string;
  text: string;
}

/** The `line.push` job payload (`withTenantJob` scopes the consumer to `tenantId`). */
export interface LinePushJob extends TenantJobData, LineMessage {}

/** A real send: handed to the `line` queue for delivery. */
export interface LineQueued {
  delivered: true;
  demo: false;
  job_id: string;
}

/** What `send` returns — a queued delivery, or (for a sandbox) the sunk message to render. */
export type LineSendResult = LineQueued | SunkMessageRecord;

/**
 * The LINE producer path (`QUEUES.line`) — the demo's "send the customer an order update over
 * LINE" step. A real tenant's message is enqueued as a `line.push` job for the LINE consumer.
 *
 * Demo guardrail (M10 task 5.2, design D7): for a `DEMO_SANDBOX` tenant nothing is enqueued and
 * the LINE API is never called — the composed message is recorded by `DemoSinkService` and
 * returned (labelled "demo — not delivered") so the UI shows exactly what the customer *would*
 * receive. That path reads no LINE credentials, so the demo works on a deployment with none.
 */
@Injectable()
export class LineService {
  constructor(
    @InjectQueue(QUEUES.line) private readonly queue: Queue,
    private readonly guard: DemoGuardService,
    private readonly sink: DemoSinkService,
  ) {}

  async send(message: LineMessage): Promise<LineSendResult> {
    if (await this.guard.isDemoSandbox()) {
      return this.sink.record({ channel: "line", to: [message.to], text: message.text });
    }
    const job = await this.queue.add(
      LINE_PUSH_JOB,
      tenantJobData({ to: message.to, text: message.text }) satisfies LinePushJob,
    );
    return { delivered: true, demo: false, job_id: String(job.id ?? "") };
  }
}
