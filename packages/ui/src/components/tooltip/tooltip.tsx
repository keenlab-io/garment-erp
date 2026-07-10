import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "../../lib/cn.js";

/** Wrap the app (or a subtree) once so tooltips share hover-intent timing. */
export const TooltipProvider = TooltipPrimitive.Provider;

export interface TooltipProps {
  /** The tooltip text. */
  content: React.ReactNode;
  /** The element the tooltip describes. */
  children: React.ReactElement;
  side?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>["side"];
  align?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>["align"];
  /** Keep the tooltip open while hovering it (e.g. for a "Requires …" permission hint). */
  delayDuration?: number;
}

/**
 * A tooltip on Radix. Commonly explains a disabled affordance ("Requires sales.document.void").
 * Requires a `TooltipProvider` ancestor. Renders on a contrast surface above all overlays.
 */
export function Tooltip({ content, children, side = "top", align = "center", delayDuration }: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            "max-w-xs rounded-md bg-text-primary px-2.5 py-1.5 text-caption text-text-inverse shadow-md",
          )}
          style={{ zIndex: "var(--z-command)" }}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-text-primary" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
