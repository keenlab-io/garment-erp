import { InvoiceStatus, QuotationStatus } from "@erp/contracts";
import { InkChip, type ChipStatus } from "@erp/ui";

export type DocLifecycleStatus = QuotationStatus | InvoiceStatus;

const LIFECYCLE_TO_CHIP: Record<DocLifecycleStatus, ChipStatus> = {
  [QuotationStatus.DRAFT]: "draft",
  [QuotationStatus.SENT]: "sent",
  [QuotationStatus.APPROVED]: "approved",
  [QuotationStatus.CONVERTED]: "converted",
  [QuotationStatus.EXPIRED]: "expired",
  [QuotationStatus.REJECTED]: "rejected",
  [QuotationStatus.VOID]: "void",
  [InvoiceStatus.ISSUED]: "issued",
  [InvoiceStatus.PARTIALLY_PAID]: "partial",
  [InvoiceStatus.PAID]: "paid",
  [InvoiceStatus.OVERDUE]: "overdue",
};

/**
 * Bridge a quotation/invoice lifecycle status to a chip status (M5 §3.4, design FD4) — Draft is
 * muted, Sent/Issued/Approved are info, Converted/Paid are success, Overdue is danger, Partial is
 * warning, Void is muted + struck through. `QuotationStatus` and `InvoiceStatus` share the
 * `DRAFT`/`VOID` literals, so the record has one entry for each.
 */
export function docLifecycleToChip(status: DocLifecycleStatus): ChipStatus {
  return LIFECYCLE_TO_CHIP[status];
}

export interface DocLifecycleChipProps {
  status: DocLifecycleStatus;
  label?: string;
  className?: string;
}

/** The document-lifecycle Ink-Chip (M5 §3.4, design FD4) — the worklist's at-a-glance status. */
export function DocLifecycleChip({ status, label, className }: DocLifecycleChipProps) {
  return <InkChip status={docLifecycleToChip(status)} label={label} className={className} />;
}
