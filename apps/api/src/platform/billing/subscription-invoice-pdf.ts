import generatePayload from "promptpay-qr";
import QRCode from "qrcode";
import type { SubscriptionInvoice } from "@erp/contracts";
import { format, groupDigits, toDecimal } from "@erp/utils";

/**
 * The vendor's payment details printed on a subscription invoice (M9 §3.3). Sourced only from the
 * `PLATFORM_*` env — never from a tenant's `PROMPTPAY_ID` or settings, so the QR always pays the
 * vendor. Every field is optional: an unset PromptPay id omits the QR section, unset bank fields
 * are left off the transfer block.
 */
export interface VendorPaymentDetails {
  promptpayId?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
}

/** A PromptPay QR for the vendor: the EMVCo payload and its PNG as a data URL. */
export interface VendorPromptPayQr {
  payload: string;
  dataUrl: string;
}

/**
 * The vendor PromptPay QR for `amount` (same `promptpay-qr` + `qrcode` pipeline as the M5 sales
 * QR, but with `PLATFORM_PROMPTPAY_ID`). `null` when no vendor id is configured or nothing is due.
 */
export async function vendorPromptPayQr(
  promptpayId: string | undefined,
  amount: string,
): Promise<VendorPromptPayQr | null> {
  const due = toDecimal(amount);
  if (!promptpayId || !due.greaterThan(0)) return null;
  const payload = generatePayload(promptpayId, { amount: due.toDecimalPlaces(2).toNumber() });
  return { payload, dataUrl: await QRCode.toDataURL(payload) };
}

/** `-25000.0000` → `-฿25,000.00` (two decimals, comma-grouped, sign before the currency). */
export function baht(value: string): string {
  const grouped = groupDigits(format(value, 2));
  return grouped.startsWith("-") ? `-฿${grouped.slice(1)}` : `฿${grouped}`;
}

const day = (iso: string): string => iso.slice(0, 10);

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The subscription invoice document (M9 §3.3, subscription-invoicing spec): number and dates, the
 * billed tenant, the typed lines (discount negative), VAT-exclusive totals, the vendor's bank-
 * transfer details, and — when configured — the vendor PromptPay QR for the amount due. Rendered
 * to PDF by M0 `PdfService`.
 */
export function renderSubscriptionInvoiceHtml(input: {
  invoice: SubscriptionInvoice;
  tenantName: string;
  vendor: VendorPaymentDetails;
  qr: VendorPromptPayQr | null;
}): string {
  const { invoice, tenantName, vendor, qr } = input;
  const rows = invoice.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.description)}</td><td class="num">${escapeHtml(baht(l.amount))}</td></tr>`,
    )
    .join("");
  const bank = [
    vendor.bankName ? `<p>Bank: ${escapeHtml(vendor.bankName)}</p>` : "",
    vendor.bankAccountName ? `<p>Account name: ${escapeHtml(vendor.bankAccountName)}</p>` : "",
    vendor.bankAccountNumber ? `<p>Account no.: ${escapeHtml(vendor.bankAccountNumber)}</p>` : "",
  ].join("");
  const status =
    invoice.status === "ISSUED" ? "" : `<p class="status">${escapeHtml(invoice.status)}</p>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: sans-serif; font-size: 12px; margin: 32px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { border-bottom: 1px solid #ccc; padding: 6px 4px; text-align: left; }
    .num { text-align: right; }
    .totals td { border: none; }
    .status { font-weight: bold; font-size: 16px; }
  </style></head><body>
    <h1>Subscription invoice ${escapeHtml(invoice.number)}</h1>
    ${status}
    <p>Billed to: ${escapeHtml(tenantName)}</p>
    <p>Issued: ${escapeHtml(day(invoice.issued_at))}${
      invoice.due_date ? ` · Due: ${escapeHtml(invoice.due_date)}` : ""
    }</p>
    <table>
      <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal (excluding VAT)</td><td class="num">${escapeHtml(baht(invoice.subtotal))}</td></tr>
      <tr><td><strong>Total due (excluding VAT)</strong></td><td class="num"><strong>${escapeHtml(baht(invoice.total))}</strong></td></tr>
    </table>
    <p>All amounts exclude VAT.</p>
    <section class="payment">
      <h2>How to pay</h2>
      <h3>Bank transfer</h3>
      ${bank}
      <p>Reference: ${escapeHtml(invoice.number)}</p>
      ${
        qr
          ? `<h3>PromptPay</h3><img alt="PromptPay QR" width="180" height="180" src="${qr.dataUrl}" data-payload="${escapeHtml(qr.payload)}">`
          : ""
      }
    </section>
  </body></html>`;
}
