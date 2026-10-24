import { describe, expect, it, vi } from "vitest";
import type { AuditEntry, AuditService } from "../audit/audit.service.js";
import type { UnitOfWork } from "../db/unit-of-work.service.js";
import { DemoSinkService } from "./demo-sink.service.js";

// M10 §5: a sunk message is audited in the sandbox (inside a tenant transaction) and handed back
// labelled "demo — not delivered" for the UI.
describe("DemoSinkService", () => {
  it("audits the would-be message and returns it as a demo send", async () => {
    const entries: AuditEntry[] = [];
    const audit = { record: vi.fn(async (e: AuditEntry) => void entries.push(e)) };
    const withTransaction = vi.fn(async (fn: () => Promise<unknown>) => fn());
    const sink = new DemoSinkService(
      audit as unknown as AuditService,
      { withTransaction } as unknown as UnitOfWork,
    );
    const message = { channel: "email" as const, to: ["a@example.com"], subject: "Hi", text: "x" };

    await expect(sink.record(message)).resolves.toEqual({
      ...message,
      delivered: false,
      demo: true,
      label: "demo — not delivered",
    });
    expect(withTransaction).toHaveBeenCalledOnce();
    expect(entries).toEqual([
      {
        action: "CREATE",
        entityType: "demo.sunk_email",
        after: message,
        reason: "demo — not delivered",
      },
    ]);
  });
});
