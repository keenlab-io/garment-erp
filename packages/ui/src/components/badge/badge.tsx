import * as React from "react";
import { cva, type VariantProps } from "../../lib/cn.js";
import { cn } from "../../lib/cn.js";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-caption font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-bg-surface text-text-secondary",
        accent: "border-accent bg-accent-subtle text-accent-text",
        success: "border-success bg-success-subtle text-success-on",
        warning: "border-warning bg-warning-subtle text-warning-on",
        danger: "border-danger bg-danger-subtle text-danger-on",
        info: "border-info bg-info-subtle text-info-on",
      },
      mono: {
        true: "font-mono tracking-wide uppercase",
        false: "",
      },
    },
    defaultVariants: {
      tone: "neutral",
      mono: false,
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * A small count / label pill. Tones map to the semantic status roles; `mono` renders a monospace
 * uppercase code badge (e.g. "CALCULATED"). Not for entity status — that is the Ink-Chip's job.
 */
export function Badge({ tone, mono, className, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, mono }), className)} {...props} />;
}

export { badgeVariants };
