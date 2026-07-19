import { INK_CHIPS, type InkChipStatus } from "@erp/design-tokens";
import { RoutingStatus } from "@erp/contracts";

/**
 * The resolved visual metadata for one chip: its glyph, default label, and swatch color. Status is
 * "never color alone" — the glyph + label carry the meaning, the swatch reinforces it.
 */
export interface ChipMeta {
  readonly glyph: string;
  readonly label: string;
  /** CSS custom property for the solid swatch background; `null` renders no swatch (void). */
  readonly swatch: string | null;
  /** Render the label muted + struck through — the document "void" treatment. */
  readonly muted?: boolean;
}

/**
 * Statuses beyond the six tokenized `InkChipStatus` values: the document lifecycle, stock-health,
 * and AR-aging states. They have no dedicated chip token — they reuse the semantic color roles
 * (issued → info, paid → success, overdue → danger, near-min → warning) per the LOCKED tokens doc.
 * None of these exist as a `@erp/contracts` enum yet (they land with M4/M5); they are design-only
 * for now.
 */
export type SemanticChipStatus =
  | "draft"
  | "sent"
  | "issued"
  | "approved"
  | "converted"
  | "expired"
  | "rejected"
  | "paid"
  | "posted"
  | "overdue"
  | "partial"
  | "void"
  | "stock-ok"
  | "stock-near-min"
  | "stock-dead"
  | "aging-current"
  | "aging-1-30"
  | "aging-31-60"
  | "aging-61-90"
  | "aging-90-plus";

/** Every status the Ink-Chip can render. A value outside this union is a compile error. */
export type ChipStatus = InkChipStatus | SemanticChipStatus;

const SEMANTIC_CHIPS: Record<SemanticChipStatus, ChipMeta> = {
  draft: { glyph: "◇", label: "Draft", swatch: "var(--color-text-muted)" },
  sent: { glyph: "→", label: "Sent", swatch: "var(--color-info)" },
  issued: { glyph: "◐", label: "Issued", swatch: "var(--color-info)" },
  approved: { glyph: "✓", label: "Approved", swatch: "var(--color-info)" },
  converted: { glyph: "⇄", label: "Converted", swatch: "var(--color-success)" },
  expired: { glyph: "◷", label: "Expired", swatch: "var(--color-warning)" },
  rejected: { glyph: "✕", label: "Rejected", swatch: "var(--color-danger)" },
  paid: { glyph: "✓", label: "Paid", swatch: "var(--color-success)" },
  posted: { glyph: "✓", label: "Posted", swatch: "var(--color-success)" },
  overdue: { glyph: "▲", label: "Overdue", swatch: "var(--color-danger)" },
  partial: { glyph: "◑", label: "Partial", swatch: "var(--color-warning)" },
  void: { glyph: "○", label: "Void", swatch: null, muted: true },
  "stock-ok": { glyph: "✓", label: "In stock", swatch: "var(--color-success)" },
  "stock-near-min": { glyph: "!", label: "Near minimum", swatch: "var(--color-warning)" },
  "stock-dead": { glyph: "▲", label: "Dead stock", swatch: "var(--color-danger)" },
  "aging-current": { glyph: "✓", label: "Current", swatch: "var(--color-success)" },
  "aging-1-30": { glyph: "◐", label: "1–30 days", swatch: "var(--color-info)" },
  "aging-31-60": { glyph: "!", label: "31–60 days", swatch: "var(--color-warning)" },
  "aging-61-90": { glyph: "▲", label: "61–90 days", swatch: "var(--color-danger)" },
  "aging-90-plus": { glyph: "▲▲", label: "90+ days", swatch: "var(--color-danger)" },
};

/** Resolve any `ChipStatus` to its glyph, label, and swatch — bridging the two status sets. */
export function chipMeta(status: ChipStatus): ChipMeta {
  const semantic = SEMANTIC_CHIPS[status as SemanticChipStatus];
  if (semantic) return semantic;
  const meta = INK_CHIPS[status as InkChipStatus]!;
  return { glyph: meta.glyph, label: meta.label, swatch: `var(${meta.token})` };
}

const ROUTING_TO_CHIP: Record<RoutingStatus, InkChipStatus> = {
  [RoutingStatus.Pending]: "pending",
  [RoutingStatus.InProgress]: "in-progress",
  [RoutingStatus.Completed]: "completed",
  [RoutingStatus.Delayed]: "delayed",
};

/**
 * Bridge the PascalCase `RoutingStatus` enum from `@erp/contracts` to the kebab-case chip keys, so
 * callers render a work-order status with `<InkChip status={routingStatusToChip(wo.status)} />` and
 * still get compile-time safety.
 */
export function routingStatusToChip(status: RoutingStatus): InkChipStatus {
  return ROUTING_TO_CHIP[status];
}
