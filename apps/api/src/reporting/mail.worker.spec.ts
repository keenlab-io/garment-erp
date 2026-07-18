import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { EventBusService } from "../events/event-bus.service.js";
import type { StorageService } from "../storage/storage.service.js";
import type { MailService } from "./mail.service.js";
import { EmailWorker, REPORT_EMAIL_JOB, type ReportEmailJob } from "./mail.worker.js";
import { REPORTING_EVENTS, type ReportDigestFailedPayload } from "./reporting.events.js";

// Task 5.3 (design D9/D12): a digest email's send failure retries under DEFAULT_JOB_OPTIONS
// and, only once the **final** attempt fails, raises a ReportDigestFailed in-app alert before
// rethrowing so BullMQ dead-letters the job. An earlier attempt retries silently — no alert.
describe("EmailWorker failure-alert boundary", () => {
  const alert: ReportDigestFailedPayload = {
    schedule_id: "sched-1",
    report_key: "sales.overview",
    recipients: ["ops@example.com"],
    reason: "",
  };

  function harness(mailError: Error) {
    const emitter = new EventEmitter2();
    const events = new EventBusService(emitter);
    const mail = { send: vi.fn().mockRejectedValue(mailError) } as unknown as MailService;
    const storage = {
      get: vi.fn().mockResolvedValue(Buffer.from("report")),
    } as unknown as StorageService;
    return { worker: new EmailWorker(mail, storage, events), emitter };
  }

  function job(attemptsMade: number, attempts: number): Job<ReportEmailJob> {
    return {
      name: REPORT_EMAIL_JOB,
      attemptsMade,
      opts: { attempts },
      data: {
        to: alert.recipients,
        subject: "Report digest: Weekly ops",
        attachments: [{ filename: "r.pdf", storage_key: "digests/1/r.pdf" }],
        alert,
      },
    } as unknown as Job<ReportEmailJob>;
  }

  it("retries silently before the final attempt — no alert raised", async () => {
    const { worker, emitter } = harness(new Error("smtp timeout"));
    const onAlert = vi.fn();
    emitter.on(REPORTING_EVENTS.reportDigestFailed, onAlert);

    await expect(worker.handle(job(1, 5))).rejects.toThrow("smtp timeout");
    expect(onAlert).not.toHaveBeenCalled();
  });

  it("raises ReportDigestFailed on the final attempt, then rethrows so the job dead-letters", async () => {
    const { worker, emitter } = harness(new Error("smtp down"));
    const received = new Promise<{ payload: ReportDigestFailedPayload }>((resolve) =>
      emitter.once(REPORTING_EVENTS.reportDigestFailed, resolve),
    );

    await expect(worker.handle(job(4, 5))).rejects.toThrow("smtp down");

    const { payload } = await received;
    expect(payload.schedule_id).toBe("sched-1");
    expect(payload.recipients).toEqual(["ops@example.com"]);
    expect(payload.reason).toContain("smtp down");
  });

  it("treats a single-attempt job as immediately final", async () => {
    const { worker, emitter } = harness(new Error("smtp down"));
    const received = new Promise<{ payload: ReportDigestFailedPayload }>((resolve) =>
      emitter.once(REPORTING_EVENTS.reportDigestFailed, resolve),
    );

    await expect(worker.handle(job(0, 1))).rejects.toThrow("smtp down");
    await expect(received).resolves.toBeDefined();
  });
});
