import type { DocLifecycleStatus } from "./components/doc-lifecycle-chip.js";

/** The `sales` i18next key for each document-lifecycle status — shared by every worklist/detail
 * screen that renders a `DocLifecycleChip`/`InkChip`, so the chip's label (not just its glyph)
 * translates with the active locale (M5 §5.1, design FD4/§5.2 "lifecycle chips not color-only"). */
export const DOC_LIFECYCLE_LABEL_KEY = {
  DRAFT: "status.draft",
  SENT: "status.sent",
  APPROVED: "status.approved",
  CONVERTED: "status.converted",
  EXPIRED: "status.expired",
  REJECTED: "status.rejected",
  VOID: "status.void",
  ISSUED: "status.issued",
  PARTIALLY_PAID: "status.partiallyPaid",
  PAID: "status.paid",
  OVERDUE: "status.overdue",
} as const satisfies Record<DocLifecycleStatus, string>;
