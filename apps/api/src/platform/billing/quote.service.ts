import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { QuoteComputeRequest, QuoteResult } from "@erp/contracts";
import { PdfService } from "../../pdf/pdf.service.js";
import { StorageService } from "../../storage/storage.service.js";
import { renderQuoteHtml } from "./quote-pdf.js";
import { bangkokDate, computeQuote } from "./quote-math.js";
import { taxBenefitConfigFor } from "./tax-benefit-config.js";

/** Lifetime of the presigned quote-PDF URL. */
const PDF_URL_TTL_SECONDS = 15 * 60;

/**
 * Stateless tax-benefit quoting (M9 §5, design D6 + open question 4): no table, no number — a
 * computation plus an optional PDF.
 *
 * - `compute` — the first-year lines at list, and the after-benefit section only when the prospect
 *   declared both eligibility facts, the quote date is on/before the decree's sunset, and the
 *   vendor's depa catalog flag (`DEPA_CATALOG_REGISTERED`) is on. Rates, cap and sunset come from
 *   the versioned `tax-benefit-config`, never literals here.
 * - `pdfUrl` — renders the same quote (accountant caveat always embedded), stores it under the
 *   control-plane key space, and presigns it.
 */
@Injectable()
export class QuoteService {
  constructor(
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  compute(input: QuoteComputeRequest, now: Date = new Date()): QuoteResult {
    return computeQuote(input, {
      today: bangkokDate(now),
      catalogRegistered: this.config.get<boolean>("DEPA_CATALOG_REGISTERED") === true,
    });
  }

  async pdfUrl(input: QuoteComputeRequest, now: Date = new Date()): Promise<{ url: string }> {
    const quote = this.compute(input, now);
    const html = renderQuoteHtml({
      quote,
      caveat: taxBenefitConfigFor(quote.quote_date).caveat,
      prospectName: input.prospect_name,
    });
    const key = this.storage.platformKey(
      `billing/quotes/${quote.quote_date}-${randomUUID()}.pdf`,
    );
    await this.storage.put(key, await this.pdf.renderHtml(html), "application/pdf");
    return { url: await this.storage.getSignedUrl(key, PDF_URL_TTL_SECONDS) };
  }
}
