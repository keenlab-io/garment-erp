import * as React from "react";
import { cn } from "../../lib/cn.js";
import { chipMeta, type ChipStatus } from "./status.js";

/** Seats the swatch on light substrate with a faint ink hairline (matches the LOCKED chip spec). */
const SWATCH_HAIRLINE = "inset 0 0 0 1px rgb(0 0 0 / 0.12)";
/** The magenta "matched / selected" spot ring around a swatch. */
const ACTIVE_RING =
  "0 0 0 2px var(--color-bg-surface), 0 0 0 3.5px var(--chip-active-state)";

export interface InkChipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** The status to render. Any value outside `ChipStatus` is a compile error. */
  status: ChipStatus;
  /** Override the default English label (e.g. a localized or bilingual string). */
  label?: React.ReactNode;
  /** Oversized swatch + type for Touch / kiosk contexts. */
  touch?: boolean;
  /** The magenta "matched / selected" spot state. */
  active?: boolean;
}

/**
 * The Ink-Chip — the product's single status signature: a solid rounded-square swatch + white glyph
 * + text label, so status is legible in grayscale and never color alone (a WCAG contract). "Void"
 * drops the swatch and renders muted + struck through; the magenta active state marks a selected /
 * matched chip. Colors, glyphs, and labels come from the token layer — nothing is hand-duplicated.
 */
export const InkChip = React.forwardRef<HTMLSpanElement, InkChipProps>(function InkChip(
  { status, label, touch = false, active = false, className, ...props },
  ref,
) {
  const meta = chipMeta(status);
  const swatchSize = touch ? "28px" : "var(--density-icon)";

  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1.5 align-middle font-sans",
        touch ? "text-body-strong" : "text-sm",
        meta.muted && "text-text-muted line-through",
        active && !meta.muted && "text-spot",
        className,
      )}
      {...props}
    >
      {meta.swatch ? (
        <span
          aria-hidden
          className="inline-flex shrink-0 items-center justify-center rounded-sm font-medium text-text-inverse"
          style={{
            width: swatchSize,
            height: swatchSize,
            background: meta.swatch,
            fontSize: touch ? "0.9rem" : "0.625rem",
            boxShadow: active ? `${SWATCH_HAIRLINE}, ${ACTIVE_RING}` : SWATCH_HAIRLINE,
          }}
        >
          {meta.glyph}
        </span>
      ) : (
        <span aria-hidden className="shrink-0">
          {meta.glyph}
        </span>
      )}
      <span>{label ?? meta.label}</span>
    </span>
  );
});
