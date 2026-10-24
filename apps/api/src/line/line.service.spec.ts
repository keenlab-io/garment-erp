import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import type { DemoGuardService } from "../demo/demo-guard.service.js";
import { DEMO_NOT_DELIVERED, type DemoSinkService, type SunkMessage } from "../demo/demo-sink.service.js";
import { runWithTenant } from "../tenancy/tenant-context.js";
import { LINE_PUSH_JOB, LineService } from "./line.service.js";

const TENANT = "00000000-0000-4000-8000-00000000000a";
const message = { to: "U1234567890abcdef", text: "ออเดอร์ SO-0001 จัดส่งแล้ว" };

function makeService(sandbox: boolean) {
  const add = vi.fn().mockResolvedValue({ id: "job-7" });
  const record = vi.fn(async (m: SunkMessage) => ({
    ...m,
    delivered: false as const,
    demo: true as const,
    label: DEMO_NOT_DELIVERED,
  }));
  const line = new LineService(
    { add } as unknown as Queue,
    { isDemoSandbox: async () => sandbox } as unknown as DemoGuardService,
    { record } as unknown as DemoSinkService,
  );
  return { line, add, record };
}

// M10 task 5.2 (demo-guardrails "LINE messages are sunk"): a sandbox's LINE update is recorded and
// returned for in-app rendering — never enqueued for the LINE API, and no credentials needed.
describe("LineService demo guardrail", () => {
  it("sinks a sandbox send and returns it labelled as a demo send", async () => {
    const { line, add, record } = makeService(true);
    const result = await runWithTenant(TENANT, "jwt", () => line.send(message));
    expect(add).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith({ channel: "line", to: [message.to], text: message.text });
    expect(result).toEqual({
      channel: "line",
      to: [message.to],
      text: message.text,
      delivered: false,
      demo: true,
      label: "demo — not delivered",
    });
  });

  it("enqueues a customer tenant's send on the line queue", async () => {
    const { line, add, record } = makeService(false);
    const result = await runWithTenant(TENANT, "jwt", () => line.send(message));
    expect(record).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(LINE_PUSH_JOB, { ...message, tenantId: TENANT });
    expect(result).toEqual({ delivered: true, demo: false, job_id: "job-7" });
  });
});
