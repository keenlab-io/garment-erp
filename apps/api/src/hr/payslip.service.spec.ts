import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import type { CryptoService } from "../common/crypto/crypto.service.js";
import type { EventBusService } from "../events/event-bus.service.js";
import type { PdfService } from "../pdf/pdf.service.js";
import type { StorageService } from "../storage/storage.service.js";
import { encryptPdf } from "./pdf-encrypt.js";
import { PayslipService } from "./payslip.service.js";

// Mock the native qpdf boundary — it is unavailable in the unit runner. The test asserts the
// *password* handed to it (task 5.5): the payslip PDF is encrypted with the employee's
// national ID, decrypted from `national_id_enc` via the crypto helper.
vi.mock("./pdf-encrypt.js", () => ({
  encryptPdf: vi.fn(() => Promise.resolve(Buffer.from("encrypted-pdf"))),
}));

const NATIONAL_ID = "1234567890123";

// A drizzle-shaped executor stub: `generate()` runs one select→innerJoin→where→limit read
// then an update→set→where write. We record the update payload to confirm `pdf_key` is set.
function fakeExecutor(row: Record<string, unknown>, captured: { pdfKey?: unknown }) {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: () => Promise.resolve([row]) }),
        }),
      }),
    }),
    update: () => ({
      set: (values: { pdfKey?: unknown }) => {
        captured.pdfKey = values.pdfKey;
        return { where: () => Promise.resolve(undefined) };
      },
    }),
  };
}

describe("PayslipService.generate — encryption password", () => {
  beforeEach(() => {
    vi.mocked(encryptPdf).mockClear();
  });

  it("encrypts the PDF with the decrypted national ID and stores it under pdf_key", async () => {
    const captured: { pdfKey?: unknown } = {};
    const row = {
      id: "slip-1",
      runId: "run-1",
      employeeId: "emp-1",
      breakdown: { base: "30000", ot: "0", allowances: [], sso: "0", tax: "0", advance: "0", deductions: [] },
      gross: "30000.0000",
      net: "30000.0000",
      empCode: "EXT0001",
      firstName: "Somchai",
      lastName: "Tester",
      nationalIdEnc: Buffer.from("ciphertext"),
    };

    const put = vi.fn(() => Promise.resolve());
    const decrypt = vi.fn(() => NATIONAL_ID);
    const service = new PayslipService(
      fakeExecutor(row, captured) as never,
      {} as Queue,
      { renderHtml: () => Promise.resolve(Buffer.from("pdf")) } as unknown as PdfService,
      { put } as unknown as StorageService,
      { decrypt } as unknown as CryptoService,
      { publishAfterCommit: vi.fn() } as unknown as EventBusService,
    );

    const key = await service.generate("slip-1");

    // Password = the national ID recovered from the encrypted PII column.
    expect(decrypt).toHaveBeenCalledOnce();
    expect(encryptPdf).toHaveBeenCalledWith(expect.any(Buffer), NATIONAL_ID);
    // The encrypted object is stored and its key recorded on the payslip.
    expect(key).toBe("payslips/run-1/slip-1.pdf");
    expect(put).toHaveBeenCalledWith(key, expect.any(Buffer), "application/pdf");
    expect(captured.pdfKey).toBe(key);
  });

  it("falls back to the emp_code when the employee has no encrypted PII", async () => {
    const captured: { pdfKey?: unknown } = {};
    const row = {
      id: "slip-2",
      runId: "run-1",
      employeeId: "emp-2",
      breakdown: { base: "0", ot: "0", allowances: [], sso: "0", tax: "0", advance: "0", deductions: [] },
      gross: "0.0000",
      net: "0.0000",
      empCode: "EXT0002",
      firstName: "No",
      lastName: "PII",
      nationalIdEnc: null,
    };

    const decrypt = vi.fn(() => NATIONAL_ID);
    const service = new PayslipService(
      fakeExecutor(row, captured) as never,
      {} as Queue,
      { renderHtml: () => Promise.resolve(Buffer.from("pdf")) } as unknown as PdfService,
      { put: vi.fn(() => Promise.resolve()) } as unknown as StorageService,
      { decrypt } as unknown as CryptoService,
      { publishAfterCommit: vi.fn() } as unknown as EventBusService,
    );

    await service.generate("slip-2");

    expect(decrypt).not.toHaveBeenCalled();
    expect(encryptPdf).toHaveBeenCalledWith(expect.any(Buffer), "EXT0002");
  });
});
