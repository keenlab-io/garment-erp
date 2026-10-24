import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import puppeteer, { type Browser } from "puppeteer";
import { DemoGuardService } from "../demo/demo-guard.service.js";

/**
 * The diagonal `DEMO` stamp (M10 task 5.5). `position: fixed` makes Chromium repeat the element
 * on every printed page, so a multi-page invoice/payslip/report is stamped page by page; the
 * screenshot path (`renderJpeg`) gets it once over the viewport. Inline styles only, so no
 * template stylesheet can hide it.
 */
export const DEMO_WATERMARK_HTML =
  '<div data-demo-watermark="true" aria-hidden="true" style="position:fixed;inset:0;' +
  "display:flex;align-items:center;justify-content:center;pointer-events:none;" +
  'z-index:2147483647;"><span style="transform:rotate(-35deg);font:700 180px/1 sans-serif;' +
  "letter-spacing:24px;color:rgba(220,38,38,0.22);border:12px solid rgba(220,38,38,0.22);" +
  'padding:8px 40px;white-space:nowrap;">DEMO</span></div>';

/** `html` with the `DEMO` watermark injected just before `</body>` (or appended without one). */
export function withDemoWatermark(html: string): string {
  const close = html.toLowerCase().lastIndexOf("</body>");
  return close === -1
    ? html + DEMO_WATERMARK_HTML
    : html.slice(0, close) + DEMO_WATERMARK_HTML + html.slice(close);
}

/**
 * HTML → PDF rendering. Lazily launches a single shared Chromium (`--no-sandbox`
 * for containers) reused across renders, and closes it on shutdown. Intended to run
 * inside the `pdf` worker (M0 plan §4).
 *
 * Teardown is `onApplicationShutdown` (Nest's last phase) rather than `onModuleDestroy`
 * (its first) so that `WorkerDrainService` — which drains BullMQ in the first phase — can
 * finish an in-flight payslip/invoice render before the browser disappears. See
 * `queue/worker-drain.service.ts`.
 *
 * Demo guardrail (M10 task 5.5, design D7): the single chokepoint for every generated document —
 * when the rendering tenant (`currentTenantId()`, set by `withTenantJob` in workers or the
 * request scope) is a `DEMO_SANDBOX`, every page is stamped with a diagonal `DEMO` watermark so
 * no sandbox document can pass as a genuine tax invoice, receipt, or payslip.
 */
@Injectable()
export class PdfService implements OnApplicationShutdown {
  private browser: Browser | null = null;

  constructor(private readonly guard: DemoGuardService) {}

  /** The document as it will be rendered — watermarked for a sandbox tenant. */
  private async prepare(html: string): Promise<string> {
    return (await this.guard.isDemoSandbox()) ? withDemoWatermark(html) : html;
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          // Chromium writes its shared-memory files to /dev/shm, which containers cap at
          // 64Mi by default — big enough to crash a multi-page A4 render. The k8s pod spec
          // mounts a larger tmpfs there, but this flag makes the image correct on its own.
          "--disable-dev-shm-usage",
        ],
      });
    }
    return this.browser;
  }

  async renderHtml(html: string): Promise<Buffer> {
    const content = await this.prepare(html);
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(content, { waitUntil: "load" });
      return Buffer.from(await page.pdf({ format: "A4", printBackground: true }));
    } finally {
      await page.close();
    }
  }

  /**
   * HTML → JPEG (M5 design D10). Renders the document at A4 width and screenshots the full
   * page, reusing the same shared Chromium as `renderHtml` (no extra image dependency).
   */
  async renderJpeg(html: string): Promise<Buffer> {
    const content = await this.prepare(html);
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 794, height: 1123 }); // A4 @ 96dpi
      await page.setContent(content, { waitUntil: "load" });
      return Buffer.from(
        await page.screenshot({ type: "jpeg", quality: 90, fullPage: true }),
      );
    } finally {
      await page.close();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
