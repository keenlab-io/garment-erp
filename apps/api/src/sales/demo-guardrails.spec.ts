import type { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import type { Db } from "@erp/db";
import { describe, expect, it, vi } from "vitest";
import { BusinessRuleError } from "../common/errors/app-exception.js";
import type { DemoGuardService } from "../demo/demo-guard.service.js";
import type { StorageService } from "../storage/storage.service.js";
import { runWithTenant } from "../tenancy/tenant-context.js";
import { EtaxService } from "./etax.service.js";
import { DEMO_PROMPTPAY_ID, PromptPayService } from "./promptpay.service.js";

// M10 tasks 5.3/5.4 (demo-guardrails): e-Tax is refused for a sandbox before anything is enqueued,
// and a sandbox's PromptPay QR encodes the dummy payee without ever reading PROMPTPAY_ID.

const TENANT = "00000000-0000-4000-8000-00000000000a";
const REAL_PAYEE = "0812345678";
const INVOICE_ID = "00000000-0000-4000-8000-0000000000f1";

const guardFor = (sandbox: boolean) =>
  ({ isDemoSandbox: async () => sandbox }) as unknown as DemoGuardService;

const db = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () =>
          Promise.resolve([{ id: INVOICE_ID, grandTotal: "1070.0000", whtAmount: "30.0000" }]),
      }),
    }),
  }),
} as unknown as Db;

describe("EtaxService demo guardrail", () => {
  function makeService(sandbox: boolean) {
    const add = vi.fn().mockResolvedValue({ id: "job-1" });
    const etax = new EtaxService(
      db,
      { add } as unknown as Queue,
      {} as StorageService,
      guardFor(sandbox),
    );
    return { etax, add };
  }

  it("refuses a sandbox submit with a 422 and enqueues nothing", async () => {
    const { etax, add } = makeService(true);
    const refused = runWithTenant(TENANT, "job", () => etax.submit(INVOICE_ID));
    await expect(refused).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(refused).rejects.toThrow("e-Tax submission is disabled in the demo");
    expect(add).not.toHaveBeenCalled();
  });

  it("enqueues a customer tenant's submit", async () => {
    const { etax, add } = makeService(false);
    await expect(runWithTenant(TENANT, "job", () => etax.submit(INVOICE_ID))).resolves.toEqual({
      job_id: "job-1",
    });
    expect(add).toHaveBeenCalledOnce();
  });
});

describe("PromptPayService demo guardrail", () => {
  function makeService(sandbox: boolean, promptpayId: string | undefined) {
    const get = vi.fn().mockReturnValue(promptpayId);
    const service = new PromptPayService(
      db,
      { get } as unknown as ConfigService,
      guardFor(sandbox),
    );
    return { service, get };
  }

  it("builds a sandbox QR from the dummy payee and never reads PROMPTPAY_ID", async () => {
    const { service, get } = makeService(true, REAL_PAYEE);
    const qr = await service.qr(INVOICE_ID);
    expect(qr.demo).toBe(true);
    expect(qr.payload).toContain(DEMO_PROMPTPAY_ID);
    expect(JSON.stringify(qr)).not.toContain(REAL_PAYEE);
    expect(JSON.stringify(qr)).not.toContain("66812345678");
    expect(get).not.toHaveBeenCalled();
  });

  it("returns the demo QR when PROMPTPAY_ID is unset", async () => {
    const { service } = makeService(true, undefined);
    await expect(service.qr(INVOICE_ID)).resolves.toMatchObject({ demo: true });
  });

  it("uses the configured payee for a customer tenant", async () => {
    const { service } = makeService(false, REAL_PAYEE);
    const qr = await service.qr(INVOICE_ID);
    expect(qr.demo).toBe(false);
    expect(qr.payload).toContain("66812345678");
  });

  it("still 422s a customer tenant with PROMPTPAY_ID unset", async () => {
    const { service } = makeService(false, undefined);
    await expect(service.qr(INVOICE_ID)).rejects.toBeInstanceOf(BusinessRuleError);
  });
});
