import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { EventBusService } from "../events/event-bus.service.js";
import type { DemoGuardService } from "../demo/demo-guard.service.js";
import type { DemoSinkService } from "../demo/demo-sink.service.js";
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
    const guard = { isDemoSandbox: async () => false } as unknown as DemoGuardService;
    const sink = { record: vi.fn() } as unknown as DemoSinkService;
    return { worker: new EmailWorker(mail, storage, events, guard, sink), emitter };
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

// M10 task 5.1 (demo-guardrails "Outbound email is sunk"): a sandbox's email job is recorded by
// the sink and completes normally — MailService is never called and no attachment is fetched.
describe("EmailWorker demo guardrail", () => {
  function harness(sandbox: boolean) {
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const storage = { get: vi.fn().mockResolvedValue(Buffer.from("report")) };
    const sink = { record: vi.fn().mockResolvedValue(undefined) };
    const guard = { isDemoSandbox: async () => sandbox } as unknown as DemoGuardService;
    const worker = new EmailWorker(
      mail as unknown as MailService,
      storage as unknown as StorageService,
      new EventBusService(new EventEmitter2()),
      guard,
      sink as unknown as DemoSinkService,
    );
    return { worker, mail, storage, sink };
  }

  const job = {
    name: REPORT_EMAIL_JOB,
    attemptsMade: 0,
    opts: {},
    data: {
      tenantId: "00000000-0000-4000-8000-000000000001",
      to: ["buyer@example.com"],
      subject: "Report digest",
      text: "body",
      attachments: [{ filename: "r.pdf", storage_key: "digests/1/r.pdf" }],
    },
  } as unknown as Job<ReportEmailJob>;

  it("sinks a sandbox email without sending or fetching attachments", async () => {
    const { worker, mail, storage, sink } = harness(true);
    await expect(worker.handle(job)).resolves.toEqual({ sent: true });
    expect(mail.send).not.toHaveBeenCalled();
    expect(storage.get).not.toHaveBeenCalled();
    expect(sink.record).toHaveBeenCalledWith({
      channel: "email",
      to: ["buyer@example.com"],
      subject: "Report digest",
      text: "body",
      attachments: ["digests/1/r.pdf"],
    });
  });

  it("sends a customer tenant's email normally", async () => {
    const { worker, mail, sink } = harness(false);
    await expect(worker.handle(job)).resolves.toEqual({ sent: true });
    expect(mail.send).toHaveBeenCalledOnce();
    expect(sink.record).not.toHaveBeenCalled();
  });
});
