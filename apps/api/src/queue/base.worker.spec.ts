import type { Job } from "bullmq";
import { describe, expect, it } from "vitest";
import { BusinessRuleError } from "../common/errors/app-exception.js";
import { currentTenant } from "../tenancy/tenant-context.js";
import { BaseWorker } from "./base.worker.js";

// M7 §7.4 / design D11 — every worker body runs inside `withTenantJob`.

const TENANT = "00000000-0000-4000-8000-00000000000a";

class ProbeWorker extends BaseWorker<unknown, unknown> {
  async handle(): Promise<unknown> {
    return currentTenant();
  }
}

const job = (name: string, data: unknown) => ({ id: "1", name, data }) as unknown as Job;

describe("BaseWorker tenant scope", () => {
  it("runs handle() inside the payload's tenant", async () => {
    const store = await new ProbeWorker().process(job("pdf.render", { tenantId: TENANT }));
    expect(store).toEqual({ tenantId: TENANT, source: "job" });
  });

  it("fails a tenant job enqueued without a tenantId", async () => {
    await expect(new ProbeWorker().process(job("pdf.render", {}))).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });

  it("runs an allowlisted platform job unscoped", async () => {
    expect(await new ProbeWorker().process(job("production.monitor.sweep", {}))).toBeUndefined();
  });
});
