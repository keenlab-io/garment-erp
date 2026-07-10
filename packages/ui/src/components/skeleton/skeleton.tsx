import * as React from "react";
import { cn } from "../../lib/cn.js";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `line` = a text bar, `block` = a larger surface, `table-row` = a row of cells. */
  variant?: "line" | "block" | "table-row";
  /** Number of cells for the `table-row` variant. */
  columns?: number;
}

/**
 * A loading placeholder shaped like the content it stands in for — used instead of a spinner so the
 * layout doesn't jump when data arrives. The shimmer respects `prefers-reduced-motion`.
 */
export function Skeleton({ variant = "line", columns = 4, className, ...props }: SkeletonProps) {
  if (variant === "table-row") {
    return (
      <div
        className={cn("flex items-center gap-4", className)}
        style={{ height: "var(--density-row-h)" }}
        aria-hidden
        {...props}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="erp-skeleton h-3 flex-1 rounded-sm" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "erp-skeleton",
        variant === "line" ? "h-3 w-full rounded-sm" : "h-24 w-full rounded-md",
        className,
      )}
      aria-hidden
      {...props}
    />
  );
}
