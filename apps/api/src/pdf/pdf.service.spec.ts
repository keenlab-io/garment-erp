import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DemoGuardService } from "../demo/demo-guard.service.js";
import { DEMO_WATERMARK_HTML, PdfService, withDemoWatermark } from "./pdf.service.js";

const { setContent } = vi.hoisted(() => ({ setContent: vi.fn() }));
vi.mock("puppeteer", () => ({
  default: {
    launch: async () => ({
      newPage: async () => ({
        setContent,
        setViewport: async () => undefined,
        pdf: async () => new Uint8Array([37, 80, 68, 70]),
        screenshot: async () => new Uint8Array([255, 216]),
        close: async () => undefined,
      }),
      close: async () => undefined,
    }),
  },
}));

const DOC = "<html><body><h1>ใบกำกับภาษี</h1></body></html>";
const guardFor = (sandbox: boolean) =>
  ({ isDemoSandbox: async () => sandbox }) as unknown as DemoGuardService;
const rendered = (): string => setContent.mock.calls[0]?.[0] as string;

describe("withDemoWatermark", () => {
  it("injects the stamp just before </body>", () => {
    expect(withDemoWatermark(DOC)).toBe(
      `<html><body><h1>ใบกำกับภาษี</h1>${DEMO_WATERMARK_HTML}</body></html>`,
    );
  });

  it("appends the stamp to a fragment with no body", () => {
    expect(withDemoWatermark("<p>x</p>")).toBe(`<p>x</p>${DEMO_WATERMARK_HTML}`);
  });

  it("repeats on every printed page (position: fixed) and reads DEMO", () => {
    expect(DEMO_WATERMARK_HTML).toContain("position:fixed");
    expect(DEMO_WATERMARK_HTML).toContain(">DEMO<");
  });
});

// M10 task 5.5 (demo-guardrails "PDFs are watermarked DEMO"): every render for a sandbox tenant
// carries the stamp; customer tenants render the document untouched.
describe("PdfService demo watermark", () => {
  beforeEach(() => setContent.mockReset());

  it.each(["renderHtml", "renderJpeg"] as const)("%s stamps a sandbox render", async (method) => {
    const pdf = new PdfService(guardFor(true));
    await pdf[method](DOC);
    expect(rendered()).toContain(DEMO_WATERMARK_HTML);
    await pdf.onApplicationShutdown();
  });

  it.each(["renderHtml", "renderJpeg"] as const)("%s leaves a customer render clean", async (method) => {
    const pdf = new PdfService(guardFor(false));
    await pdf[method](DOC);
    expect(rendered()).toBe(DOC);
    await pdf.onApplicationShutdown();
  });
});
