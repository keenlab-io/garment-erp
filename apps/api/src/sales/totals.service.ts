import { Injectable } from "@nestjs/common";
import { formatMoney, toDecimal, vatBackOut } from "@erp/utils";
import type { DocLineInput, VatApplicability, VatMode } from "@erp/contracts";

/** Standard Thai VAT rate (spec §5.5 worked examples use 7%). */
export const VAT_RATE = "0.07";

/** A line with its server-computed total (`qty × unit_price − discount`, money scale). */
export interface ComputedLine {
  input: DocLineInput;
  line_total: string;
}

/** The server-computed document totals (design D2/D3). All values are money-scale strings. */
export interface DocumentTotals {
  lines: ComputedLine[];
  subtotal: string;
  vat_amount: string;
  wht_amount: string;
  grand_total: string;
}

export interface TotalsOptions {
  vat_mode: VatApplicability; // VAT | NON_VAT
  vat_calc: VatMode; // VatNai (include) | VatNok (exclude)
  wht_rate?: string | null;
}

/**
 * Server-side document totals (design D2/D3, spec §5.5) — the single source of truth for
 * money math; client-sent totals are always ignored. Each value is rounded at **4 dp,
 * half-up** via `@erp/utils`:
 *
 * - **VAT EXCLUDE (VatNok):** `subtotal = Σ line_total`; `vat = subtotal × rate`;
 *   `grand = subtotal + vat`.
 * - **VAT INCLUDE (VatNai):** `grand = Σ line_total`; `subtotal = grand / (1 + rate)`;
 *   `vat = grand − subtotal`.
 * - **Non-VAT:** `vat = 0`; `subtotal = grand = Σ line_total`.
 * - **WHT:** `wht = subtotal × wht_rate` (issued as a certificate; net transfer = `grand − wht`).
 */
@Injectable()
export class TotalsService {
  /** `line_total = qty × unit_price − discount`, at money scale. */
  lineTotal(line: DocLineInput): string {
    const gross = toDecimal(line.qty).times(toDecimal(line.unit_price));
    const discount = line.discount ? toDecimal(line.discount) : toDecimal("0");
    return formatMoney(gross.minus(discount));
  }

  compute(lines: DocLineInput[], opts: TotalsOptions): DocumentTotals {
    const computed: ComputedLine[] = lines.map((input) => ({
      input,
      line_total: this.lineTotal(input),
    }));

    const rawSum = computed.reduce(
      (acc, l) => acc.plus(toDecimal(l.line_total)),
      toDecimal("0"),
    );

    let subtotal: string;
    let vat: string;
    let grand: string;

    if (opts.vat_mode === "NON_VAT") {
      subtotal = formatMoney(rawSum);
      vat = formatMoney(0);
      grand = subtotal;
    } else if (opts.vat_calc === "VatNai") {
      // Prices are VAT-inclusive: the line sum is the grand total; back out the subtotal.
      grand = formatMoney(rawSum);
      subtotal = vatBackOut(grand, VAT_RATE);
      vat = formatMoney(toDecimal(grand).minus(toDecimal(subtotal)));
    } else {
      // VatNok — prices are VAT-exclusive: VAT is added on top.
      subtotal = formatMoney(rawSum);
      vat = formatMoney(toDecimal(subtotal).times(toDecimal(VAT_RATE)));
      grand = formatMoney(toDecimal(subtotal).plus(toDecimal(vat)));
    }

    const wht =
      opts.wht_rate && !toDecimal(opts.wht_rate).isZero()
        ? formatMoney(toDecimal(subtotal).times(toDecimal(opts.wht_rate)))
        : formatMoney(0);

    return { lines: computed, subtotal, vat_amount: vat, wht_amount: wht, grand_total: grand };
  }
}
