import type { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import type { Db } from "@erp/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PdfService } from "../pdf/pdf.service.js";
import { StorageService } from "../storage/storage.service.js";
import { runWithTenant } from "../tenancy/tenant-context.js";
import { EtaxService } from "./etax.service.js";
import { ExportService } from "./export.service.js";

// M7 §12.2 — sales renders (invoice export, WHT certificate, e-Tax XML) return relative keys and
// land under the job tenant's `tenants/{tid}/` prefix, so two tenants' same `doc_no` never collide.

const TENANT_A = "00000000-0000-4000-8000-00000000000a";
const TENANT_B = "00000000-0000-4000-8000-00000000000b";

const CONFIG: Record<string, string> = {
  S3_BUCKET: "erp-test",
  S3_ENDPOINT: "http://minio.test:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY: "test",
  S3_SECRET_KEY: "test-secret",
};

const INVOICE = {
  id: "11111111-1111-4111-8111-111111111111",
  docNo: "INV20260001",
  subtotal: "100.00",
  vatAmount: "7.00",
  whtAmount: "3.00",
  whtRate: "0.03",
  grandTotal: "107.00",
};

function makeServices() {
  // `select().from(invoice).where(...).limit(1)` → the invoice; `loadLines` → no lines.
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([INVOICE]),
          orderBy: () => Promise.resolve([]),
        }),
      }),
    }),
  } as unknown as Db;
  const storage = new StorageService({
    getOrThrow: (key: string) => CONFIG[key],
    get: () => undefined,
  } as unknown as ConfigService);
  const send = vi.fn().mockResolvedValue({});
  (storage as unknown as { client: { send: typeof send } }).client.send = send;
  const pdf = {
    renderHtml: () => Promise.resolve(Buffer.from("%PDF")),
    renderJpeg: () => Promise.resolve(Buffer.from("jpg")),
  } as unknown as PdfService;
  const exports = new ExportService(db, {} as Queue, pdf, storage);
  const etax = new EtaxService(db, {} as Queue, storage);
  return { storage, send, exports, etax };
}

const sentKeys = (send: ReturnType<typeof vi.fn>): unknown[] =>
  send.mock.calls.map((c) => (c[0] as { input: { Key: unknown } }).input.Key);

describe("Sales renders store under the tenant prefix", () => {
  let storage: StorageService | undefined;
  afterEach(() => storage?.onModuleDestroy());

  it("keeps the returned key relative and stores it under the caller tenant", async () => {
    const made = makeServices();
    storage = made.storage;

    const keys = await runWithTenant(TENANT_A, "job", async () => [
      await made.exports.runExport(INVOICE.id, "pdf"),
      await made.exports.runWhtCertificate(INVOICE.id),
      await made.etax.run(INVOICE.id),
    ]);

    expect(keys).toEqual([
      `exports/invoice/${INVOICE.docNo}.pdf`,
      `exports/wht-certificate/${INVOICE.docNo}.pdf`,
      `etax/${INVOICE.docNo}.xml`,
    ]);
    expect(sentKeys(made.send)).toEqual(keys.map((k) => `tenants/${TENANT_A}/${k}`));
  });

  it("two tenants rendering the same doc_no write distinct objects", async () => {
    const made = makeServices();
    storage = made.storage;

    await runWithTenant(TENANT_A, "job", () => made.exports.runExport(INVOICE.id, "excel"));
    await runWithTenant(TENANT_B, "job", () => made.exports.runExport(INVOICE.id, "excel"));

    expect(sentKeys(made.send)).toEqual([
      `tenants/${TENANT_A}/exports/invoice/${INVOICE.docNo}.xlsx`,
      `tenants/${TENANT_B}/exports/invoice/${INVOICE.docNo}.xlsx`,
    ]);
  });
});
