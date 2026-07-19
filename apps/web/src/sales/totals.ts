import { formatMoney, sumMoney, toDecimal, vatBackOut, type DecimalInput } from "@erp/utils";
import type { DocLineInput, VatApplicability, VatMode } from "@erp/contracts";

/** Standard Thai VAT rate — mirrors `apps/api/src/sales/totals.service.ts` (spec §5.5). */
export const VAT_RATE = "0.07";

/** A line with its client-computed total (`qty × unit_price − discount`, money scale). */
export interface ComputedLine {
  input: DocLineInput;
  line_total: string;
}

/** Document totals, computed the same way the server does (design MD1/MD2) so the live preview
 * never drifts from what `TotalsService.compute` will persist on save. */
export interface DocumentTotals {
  lines: ComputedLine[];
  subtotal: string;
  vat_amount: string;
  wht_amount: string;
  grand_total: string;
}

export interface TotalsOptions {
  vat_mode: VatApplicability;
  vat_calc: VatMode;
  wht_rate?: string | null;
}

/** `line_total = qty × unit_price − discount`, at money scale. */
export function lineTotal(line: DocLineInput): string {
  const gross = toDecimal(line.qty).times(toDecimal(line.unit_price));
  const discount = line.discount ? toDecimal(line.discount) : toDecimal("0");
  return formatMoney(gross.minus(discount));
}

/**
 * The client-side twin of `TotalsService.compute` (design MD1 "totals compute live as the user
 * types") — same VAT-include/exclude/non-VAT branching and WHT deduction, so the split
 * editor/preview never shows a number the server would disagree with. Client-sent totals are
 * still ignored server-side (spec §5.5); this only drives the live preview.
 */
export function computeDocumentTotals(lines: DocLineInput[], opts: TotalsOptions): DocumentTotals {
  const computed: ComputedLine[] = lines.map((input) => ({ input, line_total: lineTotal(input) }));
  const rawSum = sumMoney(computed.map((l) => l.line_total));

  let subtotal: string;
  let vat: string;
  let grand: string;

  if (opts.vat_mode === "NON_VAT") {
    subtotal = rawSum;
    vat = formatMoney(0);
    grand = subtotal;
  } else if (opts.vat_calc === "VatNai") {
    // Prices are VAT-inclusive: the line sum is the grand total; back out the subtotal.
    grand = rawSum;
    subtotal = vatBackOut(grand, VAT_RATE);
    vat = formatMoney(toDecimal(grand).minus(toDecimal(subtotal)));
  } else {
    // VatNok — prices are VAT-exclusive: VAT is added on top.
    subtotal = rawSum;
    vat = formatMoney(toDecimal(subtotal).times(toDecimal(VAT_RATE)));
    grand = formatMoney(toDecimal(subtotal).plus(toDecimal(vat)));
  }

  const wht =
    opts.wht_rate && !toDecimal(opts.wht_rate).isZero()
      ? formatMoney(toDecimal(subtotal).times(toDecimal(opts.wht_rate)))
      : formatMoney(0);

  return { lines: computed, subtotal, vat_amount: vat, wht_amount: wht, grand_total: grand };
}

/** `grand_total − wht_amount` — what the customer actually transfers (design MD2). */
export function netToReceive(grandTotal: DecimalInput, whtAmount: DecimalInput): string {
  return formatMoney(toDecimal(grandTotal).minus(toDecimal(whtAmount)));
}
