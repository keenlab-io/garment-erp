import type * as React from "react";
import { cn } from "./cn.js";

/**
 * Shared visual base for bordered form controls (Input, Select trigger, Combobox trigger). Semantic
 * tokens only; the invalid state (border + ring in danger) is driven by `aria-invalid`, which
 * `FormField` sets automatically.
 */
export const controlSurface = cn(
  "flex w-full items-center rounded-md border border-border bg-bg-surface text-text-primary font-sans",
  "placeholder:text-text-muted",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-bg-app",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger",
);

/** Density-driven sizing for a control, applied via inline style (tokens have no Tailwind utility). */
export const controlSizing: React.CSSProperties = {
  minHeight: "var(--density-control-h)",
  paddingInline: "var(--density-pad-x)",
  fontSize: "var(--density-font)",
};
