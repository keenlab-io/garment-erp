// Ink-Chip status metadata (PartA_Direction_Tokens_LOCKED §3a/§5.3) — the non-CSS half of
// the chip signature. Colors ship through the token CSS as `--chip-*`; this pairs each with
// its glyph + label so the future Ink-Chip component renders "never color-alone". Labels are
// English defaults; localized keys arrive with the i18n layer.

export type InkChipStatus = "pending" | "in-progress" | "completed" | "delayed" | "hold" | "outsourced";

export interface InkChipMeta {
  /** The CSS custom property carrying the chip's swatch color, e.g. `--chip-pending`. */
  readonly token: string;
  readonly glyph: string;
  readonly label: string;
}

export const INK_CHIPS: Record<InkChipStatus, InkChipMeta> = {
  pending: { token: "--chip-pending", glyph: "○", label: "Pending" },
  "in-progress": { token: "--chip-in-progress", glyph: "◐", label: "In Progress" },
  completed: { token: "--chip-completed", glyph: "●✓", label: "Completed" },
  delayed: { token: "--chip-delayed", glyph: "▲", label: "Delayed" },
  hold: { token: "--chip-hold", glyph: "❙❙", label: "On Hold" },
  outsourced: { token: "--chip-outsourced", glyph: "↗", label: "Subcontracted" },
};

/** The magenta "currently matched / selected" spot state (§3a) — a state, not a status. */
export const CHIP_ACTIVE_STATE_TOKEN = "--chip-active-state";
