import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../common/errors/app-exception.js";
import type { EventBusService } from "../events/event-bus.service.js";
import type { PdfService } from "../pdf/pdf.service.js";
import type { StorageService } from "../storage/storage.service.js";
import { runWithTenant } from "../tenancy/tenant-context.js";
import { ExportService, REPORT_EXPORT_JOB } from "./export.service.js";
import type { ReportService } from "./report.service.js";

const TENANT_A = "00000000-0000-4000-8000-00000000000a";
const TENANT_B = "00000000-0000-4000-8000-00000000000b";

/** A `report`-queue stub holding one completed job. */
function setup(job: { name: string; data: unknown } | undefined) {
  const queue = {
    add: vi.fn().mockResolvedValue({ id: "7" }),
    getJob: vi.fn().mockResolvedValue(
      job && {
        ...job,
        returnvalue: { key: "exports/reports/cost.valuation/1.csv" },
        getState: vi.fn().mockResolvedValue("completed"),
      },
    ),
  } as unknown as Queue;
  const storage = {
    getSignedUrl: vi.fn().mockResolvedValue("https://signed.example/x"),
  } as unknown as StorageService;
  const exports = new ExportService(
    queue,
    {} as ReportService,
    {} as PdfService,
    storage,
    {} as EventBusService,
  );
  return { queue, storage, exports };
}

// M7 §13.1 — report exports are per tenant: the job carries its tenant, and the poll only
// resolves for the tenant that enqueued it (the `report` queue and its ids are shared).
describe("ExportService (tenancy)", () => {
  it("stamps the export job with the caller's tenant", async () => {
    const { queue, exports } = setup(undefined);
    await runWithTenant(TENANT_A, "jwt", () =>
      exports.enqueueExport("cost.valuation", "CSV", { from: "2026-03-01" }),
    );
    expect(queue.add).toHaveBeenCalledWith(REPORT_EXPORT_JOB, {
      report_key: "cost.valuation",
      format: "CSV",
      params: { from: "2026-03-01" },
      tenantId: TENANT_A,
    });
  });

  it("returns the signed URL to the tenant that enqueued the export", async () => {
    const { exports } = setup({ name: REPORT_EXPORT_JOB, data: { tenantId: TENANT_A } });
    const status = await runWithTenant(TENANT_A, "jwt", () => exports.getStatus("7"));
    expect(status).toEqual({ status: "DONE", file_url: "https://signed.example/x" });
  });

  it("404s another tenant's export job without presigning", async () => {
    const { storage, exports } = setup({ name: REPORT_EXPORT_JOB, data: { tenantId: TENANT_A } });
    await expect(
      runWithTenant(TENANT_B, "jwt", () => exports.getStatus("7")),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });

  it("404s a job that is not an export (e.g. a digest render) or carries no tenant", async () => {
    const digest = setup({ name: "reporting.digest", data: { tenantId: TENANT_A } });
    await expect(
      runWithTenant(TENANT_A, "jwt", () => digest.exports.getStatus("7")),
    ).rejects.toBeInstanceOf(NotFoundError);

    const unscoped = setup({ name: REPORT_EXPORT_JOB, data: {} });
    await expect(
      runWithTenant(TENANT_A, "jwt", () => unscoped.exports.getStatus("7")),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s an unknown job id", async () => {
    const { exports } = setup(undefined);
    await expect(
      runWithTenant(TENANT_A, "jwt", () => exports.getStatus("404")),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
