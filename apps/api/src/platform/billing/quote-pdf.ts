import type { QuoteResult } from "@erp/contracts";
import { toDecimal } from "@erp/utils";
import { baht } from "./subscription-invoice-pdf.js";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const range = (r: { min: string; max: string }): string => `${baht(r.min)} – ${baht(r.max)}`;

/**
 * The quote document (M9 §5.2, design D6, tax-benefit-quoting spec): plan, term, the first-year
 * lines at list price and their VAT-exclusive total; the after-tax-benefit section ONLY when
 * `quote.tax_benefit` is present (declared-eligible, pre-sunset, depa flag on) — otherwise it is
 * absent entirely, not zeroed; and the accountant caveat block on EVERY output, rendered directly
 * after the benefit figures when they exist. No parameter can drop the caveat. Rendered to PDF by
 * M0 `PdfService`.
 */
export function renderQuoteHtml(input: {
  quote: QuoteResult;
  /** The caveat of the config version the quote was computed under. */
  caveat: string;
  prospectName?: string;
}): string {
  const { quote, caveat, prospectName } = input;
  const rows = quote.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.description)}</td><td class="num">${escapeHtml(baht(l.amount))}</td></tr>`,
    )
    .join("");

  const tb = quote.tax_benefit;
  const benefit = tb
    ? `<section class="tax-benefit">
      <h2>Illustrative SME software tax benefit</h2>
      <p>If your business qualifies, the cost of this software may be counted twice when
      calculating corporate income tax.</p>
      <table>
        <tr><td>Qualifying spend</td><td class="num">${escapeHtml(baht(tb.qualifying_spend))}</td></tr>
        <tr><td>Extra tax deduction</td><td class="num">${escapeHtml(baht(tb.extra_deduction))}</td></tr>
        <tr><td>Estimated tax saving</td><td class="num">${escapeHtml(range(tb.estimated_saving))}</td></tr>
        <tr><td><strong>Effective first-year price</strong></td><td class="num"><strong>${escapeHtml(range(tb.effective_price))}</strong></td></tr>
      </table>
      ${
        toDecimal(tb.non_qualifying_spend).greaterThan(0)
          ? `<p class="non-qualifying">${escapeHtml(baht(tb.non_qualifying_spend))} of the first-year total is above the annual cap, is shown at list price, and does not qualify for the extra deduction.</p>`
          : ""
      }
      ${caveatBlock(caveat)}
    </section>`
    : caveatBlock(caveat);

  const declared = quote.eligibility
    ? `<p class="declaration">Eligibility declared by ${escapeHtml(quote.eligibility.declared_by)} on ${escapeHtml(
        quote.eligibility.declared_at.slice(0, 10),
      )}: registered capital at most ฿5M — ${yesNo(
        quote.eligibility.registered_capital_at_most_5m,
      )}; annual revenue at most ฿30M — ${yesNo(quote.eligibility.annual_revenue_at_most_30m)}.</p>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: sans-serif; font-size: 12px; margin: 32px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { border-bottom: 1px solid #ccc; padding: 6px 4px; text-align: left; }
    .num { text-align: right; }
    .caveat { border: 1px solid #999; padding: 8px 12px; font-style: italic; }
  </style></head><body>
    <h1>Quotation — ${escapeHtml(quote.plan)} plan</h1>
    ${prospectName ? `<p>Prepared for: ${escapeHtml(prospectName)}</p>` : ""}
    <p>Quote date: ${escapeHtml(quote.quote_date)} · Term: ${escapeHtml(quote.term)} year${
      quote.term === 1 ? "" : "s"
    }</p>
    <table>
      <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tr><td><strong>First-year total at list price (excluding VAT)</strong></td><td class="num"><strong>${escapeHtml(
        baht(quote.first_year_total),
      )}</strong></td></tr>
    </table>
    <p>All amounts exclude VAT.</p>
    ${declared}
    ${benefit}
  </body></html>`;
}

function caveatBlock(caveat: string): string {
  return `<aside class="caveat">${escapeHtml(caveat)}</aside>`;
}

const yesNo = (v: boolean): string => (v ? "yes" : "no");
