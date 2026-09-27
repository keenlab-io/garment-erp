import { describe, expect, it } from "vitest";
import { BusinessRuleError } from "../common/errors/app-exception.js";
import { currentTenant, runWithTenant } from "./tenant-context.js";
import { tenantJobData, withTenantJob } from "./with-tenant-job.js";

const TENANT = "00000000-0000-4000-8000-00000000000a";

describe("withTenantJob", () => {
  it("runs the job body inside the payload's tenant (source: job)", async () => {
    const store = await withTenantJob({ name: "pdf.render", data: { tenantId: TENANT } }, async () =>
      currentTenant(),
    );
    expect(store).toEqual({ tenantId: TENANT, source: "job" });
  });

  it("throws BusinessRuleError when a tenant job carries no tenantId", async () => {
    await expect(withTenantJob({ name: "pdf.render", data: {} }, async () => 1)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
    await expect(withTenantJob({ name: "pdf.render", data: null }, async () => 1)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });

  it("throws on a malformed tenantId, even for a platform job", async () => {
    await expect(
      withTenantJob({ name: "sales.overdue.sweep", data: { tenantId: "nope" } }, async () => 1),
    ).rejects.toThrow(/malformed/);
  });

  it("lets an allowlisted platform job run unscoped", async () => {
    const store = await withTenantJob({ name: "sales.overdue.sweep", data: {} }, async () =>
      currentTenant(),
    );
    expect(store).toBeUndefined();
  });
});

describe("tenantJobData", () => {
  it("stamps the payload with the ambient tenant", () => {
    const data = runWithTenant(TENANT, "jwt", () => tenantJobData({ payslip_id: "p1" }));
    expect(data).toEqual({ payslip_id: "p1", tenantId: TENANT });
  });

  it("refuses to build a tenant job outside a tenant scope", () => {
    expect(() => tenantJobData({ payslip_id: "p1" })).toThrow(BusinessRuleError);
  });
});
