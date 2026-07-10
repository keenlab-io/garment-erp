import * as React from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "../../lib/cn.js";

export interface IconProps extends Omit<LucideProps, "ref" | "size"> {
  /** A `lucide-react` icon component, e.g. `Search`. */
  icon: LucideIcon;
  /** Explicit pixel size. Omit to size from the active density's `--density-icon` token. */
  size?: number;
  /**
   * Accessible label. When provided the icon is exposed as `role="img"`; when omitted the
   * icon is decorative and hidden from assistive tech (`aria-hidden`).
   */
  label?: string;
}

/**
 * Renders a `lucide-react` glyph on the 24px grid, sized by the density icon token by default so
 * icons scale with Comfortable / Compact / Touch without per-call sizing. Decorative unless `label`
 * is given. Every other primitive draws its glyphs through this wrapper.
 */
export const Icon = React.forwardRef<SVGSVGElement, IconProps>(function Icon(
  { icon: LucideGlyph, size, label, className, style, ...props },
  ref,
) {
  const sizing =
    size != null
      ? { width: size, height: size }
      : { width: "var(--density-icon)", height: "var(--density-icon)" };
  return (
    <LucideGlyph
      ref={ref}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      className={cn("shrink-0", className)}
      style={{ ...sizing, ...style }}
      {...props}
    />
  );
});
