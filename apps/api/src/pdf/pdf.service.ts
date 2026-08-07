import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import puppeteer, { type Browser } from "puppeteer";

/**
 * HTML → PDF rendering. Lazily launches a single shared Chromium (`--no-sandbox`
 * for containers) reused across renders, and closes it on shutdown. Intended to run
 * inside the `pdf` worker (M0 plan §4).
 *
 * Teardown is `onApplicationShutdown` (Nest's last phase) rather than `onModuleDestroy`
 * (its first) so that `WorkerDrainService` — which drains BullMQ in the first phase — can
 * finish an in-flight payslip/invoice render before the browser disappears. See
 * `queue/worker-drain.service.ts`.
 */
@Injectable()
export class PdfService implements OnApplicationShutdown {
  private browser: Browser | null = null;

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
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "load" });
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
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 794, height: 1123 }); // A4 @ 96dpi
      await page.setContent(html, { waitUntil: "load" });
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
