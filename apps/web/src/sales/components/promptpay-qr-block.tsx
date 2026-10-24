import type { PromptPayQr } from "@erp/contracts";
import { MoneyCell, Skeleton, cn } from "@erp/ui";

export interface PromptPayQrBlockLabels {
  title: string;
  scanHint: string;
  refLabel: string;
  empty: string;
  /** Shown when the QR is a demo-tenant placeholder (`qr.demo`). */
  demoLabel: string;
}

const defaultLabels: PromptPayQrBlockLabels = {
  title: "PromptPay",
  scanHint: "Scan to pay",
  refLabel: "Ref",
  empty: "Issue the invoice to generate a PromptPay QR",
  demoLabel: "demo — do not pay",
};

export interface PromptPayQrBlockProps {
  /** `null` while not yet issued (no invoice id to fetch against). */
  qr: PromptPayQr | null;
  loading?: boolean;
  /** The amount the QR embeds — shown as a caption, not encoded by this component (the backend
   * embeds it in the payload). */
  amount?: string;
  labels?: Partial<PromptPayQrBlockLabels>;
  className?: string;
}

/**
 * The PromptPay QR block (M5 §3.3, design MD2) — renders the backend-generated EMVCo QR (the
 * frontend never builds the payload itself, it only displays the `png_base64` + `payload` the
 * `getInvoicePromptPayQr` endpoint returns) with an amount caption and the raw payload in mono for
 * manual entry as a fallback.
 */
export function PromptPayQrBlock({ qr, loading = false, amount, labels: labelsProp, className }: PromptPayQrBlockProps) {
  const labels = { ...defaultLabels, ...labelsProp };

  return (
    <div className={cn("flex flex-col items-center gap-2 text-center", className)}>
      <p className="text-sm font-medium text-text-primary">{labels.title}</p>
      {loading ? (
        <Skeleton variant="block" className="size-40" />
      ) : qr ? (
        <>
          <img
            src={`data:image/png;base64,${qr.png_base64}`}
            alt={labels.title}
            width={160}
            height={160}
            className="rounded-md border border-border"
          />
          {qr.demo ? (
            <p className="text-caption font-semibold text-danger">{labels.demoLabel}</p>
          ) : (
            <p className="text-caption text-text-muted">{labels.scanHint}</p>
          )}
          {amount && <MoneyCell value={amount} className="text-body-strong" />}
          <p className="break-all font-mono text-mono text-caption text-text-muted">
            {labels.refLabel}: {qr.payload}
          </p>
        </>
      ) : (
        <p className="text-caption text-text-muted">{labels.empty}</p>
      )}
    </div>
  );
}
