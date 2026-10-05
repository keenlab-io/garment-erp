import type { ConfigService } from "@nestjs/config";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BusinessRuleError } from "../common/errors/app-exception.js";
import { runWithTenant } from "../tenancy/tenant-context.js";
import { StorageService, tenantPrefix } from "./storage.service.js";

// M7 §7.2 / design D13 — every object key resolves under `tenants/{tid}/`, storage refuses to
// run outside a tenant scope, and a presign is minted only for the caller-tenant's prefix.

const TENANT_A = "00000000-0000-4000-8000-00000000000a";
const TENANT_B = "00000000-0000-4000-8000-00000000000b";

const CONFIG: Record<string, string> = {
  S3_BUCKET: "erp-test",
  S3_ENDPOINT: "http://minio.test:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY: "test",
  S3_SECRET_KEY: "test-secret",
};

function makeService() {
  const config = {
    getOrThrow: (key: string) => CONFIG[key],
    get: () => undefined,
  } as unknown as ConfigService;
  const service = new StorageService(config);
  const send = vi.fn().mockResolvedValue({});
  (service as unknown as { client: { send: typeof send } }).client.send = send;
  return { service, send };
}

/** The `Key` of the n-th command sent to the S3 client. */
const sentKey = (send: ReturnType<typeof vi.fn>, n = 0): unknown =>
  (send.mock.calls[n]?.[0] as { input: { Key: unknown } }).input.Key;

describe("StorageService tenant key space", () => {
  let service: StorageService | undefined;
  afterEach(() => service?.onModuleDestroy());

  it("prefixes put keys with the caller-tenant's prefix", async () => {
    const made = makeService();
    service = made.service;
    await runWithTenant(TENANT_A, "jwt", () =>
      made.service.put("payslips/p1.pdf", "x", "application/pdf"),
    );
    expect(made.send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
    expect(sentKey(made.send)).toBe(`tenants/${TENANT_A}/payslips/p1.pdf`);
  });

  it("resolves get and delete under the caller-tenant's prefix", async () => {
    const made = makeService();
    service = made.service;
    await runWithTenant(TENANT_B, "job", async () => {
      await made.service.get("reports/r.xlsx");
      await made.service.delete("reports/r.xlsx");
    });
    expect(made.send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(sentKey(made.send, 0)).toBe(`tenants/${TENANT_B}/reports/r.xlsx`);
    expect(sentKey(made.send, 1)).toBe(`tenants/${TENANT_B}/reports/r.xlsx`);
  });

  it("refuses to touch storage outside a tenant scope", async () => {
    const made = makeService();
    service = made.service;
    await expect(made.service.put("a.txt", "x")).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(made.service.getSignedUrl("a.txt")).rejects.toBeInstanceOf(BusinessRuleError);
    expect(made.send).not.toHaveBeenCalled();
  });

  it("rejects keys that could escape the tenant prefix", async () => {
    const made = makeService();
    service = made.service;
    await runWithTenant(TENANT_A, "jwt", async () => {
      for (const key of ["", "/abs.pdf", "../x.pdf", `a/../../tenants/${TENANT_B}/x.pdf`]) {
        await expect(made.service.put(key, "x")).rejects.toBeInstanceOf(BusinessRuleError);
      }
    });
    expect(made.send).not.toHaveBeenCalled();
  });

  it("presigns only inside the caller-tenant's prefix", async () => {
    const made = makeService();
    service = made.service;
    const url = await runWithTenant(TENANT_A, "jwt", () =>
      made.service.getSignedUrl("payslips/p1.pdf"),
    );
    expect(new URL(url).pathname).toBe(`/erp-test/${tenantPrefix(TENANT_A)}payslips/p1.pdf`);
  });

  it("lists the caller-tenant's objects relative to its prefix, across pages", async () => {
    const made = makeService();
    service = made.service;
    const prefix = tenantPrefix(TENANT_A);
    made.send
      .mockResolvedValueOnce({
        Contents: [{ Key: `${prefix}payslips/p1.pdf` }],
        IsTruncated: true,
        NextContinuationToken: "t1",
      })
      .mockResolvedValueOnce({ Contents: [{ Key: `${prefix}reports/r.xlsx` }], IsTruncated: false });
    const keys = await runWithTenant(TENANT_A, "job", () => made.service.listTenantObjects());
    expect(keys).toEqual(["payslips/p1.pdf", "reports/r.xlsx"]);
    const first = made.send.mock.calls[0]?.[0] as ListObjectsV2Command;
    expect(first).toBeInstanceOf(ListObjectsV2Command);
    expect(first.input.Prefix).toBe(prefix);
    expect((made.send.mock.calls[1]?.[0] as ListObjectsV2Command).input.ContinuationToken).toBe("t1");
  });

  it("deletes exactly the caller-tenant's prefix", async () => {
    const made = makeService();
    service = made.service;
    const prefix = tenantPrefix(TENANT_B);
    made.send.mockResolvedValueOnce({ Contents: [{ Key: `${prefix}a.pdf` }, { Key: `${prefix}b/c.pdf` }] });
    const deleted = await runWithTenant(TENANT_B, "job", () => made.service.deleteTenantObjects());
    expect(deleted).toBe(2);
    const del = made.send.mock.calls[1]?.[0] as DeleteObjectsCommand;
    expect(del).toBeInstanceOf(DeleteObjectsCommand);
    expect(del.input.Delete?.Objects).toEqual([{ Key: `${prefix}a.pdf` }, { Key: `${prefix}b/c.pdf` }]);
  });

  it("refuses to list or delete outside a tenant scope", async () => {
    const made = makeService();
    service = made.service;
    await expect(made.service.listTenantObjects()).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(made.service.deleteTenantObjects()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(made.send).not.toHaveBeenCalled();
  });

  it("uses platform keys verbatim via the explicit escape hatch", async () => {
    const made = makeService();
    service = made.service;
    await made.service.put(made.service.platformKey("exports/all.csv"), "x");
    expect(sentKey(made.send)).toBe("platform/exports/all.csv");
  });
});
