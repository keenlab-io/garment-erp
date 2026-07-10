import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/cn.js";

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;
export const DrawerTitle = DialogPrimitive.Title;
export const DrawerDescription = DialogPrimitive.Description;

/**
 * A side panel on Radix Dialog: header + scrolling body + sticky footer, anchored to an edge. Used
 * for detail peeks, quick-create, and filters. Overlay and panel both sit in the `--z-drawer` band
 * (the panel stacks above via DOM order). Radix supplies focus trap + `Esc`/outside dismissal.
 */
export const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: "left" | "right" }
>(function DrawerContent({ className, children, side = "right", style, ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 bg-text-primary/40"
        style={{ zIndex: "var(--z-drawer)" }}
      />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed inset-y-0 flex w-[min(28rem,calc(100vw-2rem))] flex-col bg-bg-surface shadow-lg focus:outline-none",
          side === "right" ? "right-0 border-l border-border" : "left-0 border-r border-border",
          className,
        )}
        style={{ zIndex: "var(--z-drawer)", ...style }}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

/** Sticky header with the title and a close affordance. */
export function DrawerHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-2 border-b border-border p-4",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">{children}</div>
      <DialogPrimitive.Close
        aria-label="Close"
        className="shrink-0 rounded-sm text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <X className="size-4" aria-hidden />
      </DialogPrimitive.Close>
    </div>
  );
}

/** The scrolling body. */
export function DrawerBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 overflow-y-auto p-4", className)} {...props} />;
}

/** Sticky footer pinned to the bottom of the panel. */
export function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex shrink-0 justify-end gap-2 border-t border-border bg-bg-surface p-4",
        className,
      )}
      {...props}
    />
  );
}
