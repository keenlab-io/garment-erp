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
 * Statuses beyond the six tokenized `InkChipStatus` values: the document lifecycle and stock-health
 * states. They have no dedicated chip token — they reuse the semantic color roles (issued → info,
 * paid → success, overdue → danger, near-min → warning) per the LOCKED tokens doc. None of these
 * exist as a `@erp/contracts` enum yet (they land with M4/M5); they are design-only for now.
 */
export type SemanticChipStatus =
  | "draft"
  | "issued"
  | "approved"
  | "paid"
  | "posted"
  | "overdue"
  | "partial"
  | "void"
  | "stock-ok"
  | "stock-near-min"
  | "stock-dead";

/** Every status the Ink-Chip can render. A value outside this union is a compile error. */
export type ChipStatus = InkChipStatus | SemanticChipStatus;

const SEMANTIC_CHIPS: Record<SemanticChipStatus, ChipMeta> = {
  draft: { glyph: "◇", label: "Draft", swatch: "var(--color-text-muted)" },
  issued: { glyph: "◐", label: "Issued", swatch: "var(--color-info)" },
  approved: { glyph: "✓", label: "Approved", swatch: "var(--color-info)" },
  paid: { glyph: "✓", label: "Paid", swatch: "var(--color-success)" },
  posted: { glyph: "✓", label: "Posted", swatch: "var(--color-success)" },
  overdue: { glyph: "▲", label: "Overdue", swatch: "var(--color-danger)" },
  partial: { glyph: "◑", label: "Partial", swatch: "var(--color-warning)" },
  void: { glyph: "○", label: "Void", swatch: null, muted: true },
  "stock-ok": { glyph: "✓", label: "In stock", swatch: "var(--color-success)" },
  "stock-near-min": { glyph: "!", label: "Near minimum", swatch: "var(--color-warning)" },
  "stock-dead": { glyph: "▲", label: "Dead stock", swatch: "var(--color-danger)" },
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
