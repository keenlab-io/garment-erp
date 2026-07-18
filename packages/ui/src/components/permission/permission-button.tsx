import * as React from "react";
import type { Permission } from "@erp/contracts";
import { cn } from "../../lib/cn.js";
import { Button, type ButtonProps } from "../button/button.js";
import { Tooltip } from "../tooltip/tooltip.js";
import { usePermissions } from "./permissions-context.js";

export interface PermissionButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "disabled"> {
  /** The permission gating this in-context action. */
  required: Permission;
  variant?: Exclude<NonNullable<ButtonProps["variant"]>, "icon">;
  loading?: boolean;
  /** Overrides the default "Requires <permission>" tooltip text shown when denied. */
  deniedTooltip?: React.ReactNode;
  "aria-label"?: string;
}

/**
 * The disabled-with-tooltip pattern for in-context actions (spec "Absent versus disabled"): a user
 * who can reasonably expect this action but lacks `required` sees it disabled with a tooltip naming
 * the exact permission code, e.g. "Requires sales.document.void" — recognition over recall, without
 * hiding the action outright the way an absent nav entry would. The button stays hoverable and
 * focusable (`aria-disabled`, not the native `disabled` attribute — a natively disabled element fires
 * no pointer/focus events in real browsers, which would silence the Radix tooltip) while its click is
 * swallowed. Requires a `TooltipProvider` ancestor.
 */
export const PermissionButton = React.forwardRef<HTMLButtonElement, PermissionButtonProps>(
  function PermissionButton({ required, deniedTooltip, className, onClick, ...props }, ref) {
    const { has } = usePermissions();
    const allowed = has(required);

    if (allowed) {
      return <Button ref={ref} className={className} onClick={onClick} {...props} />;
    }

    return (
      <Tooltip content={deniedTooltip ?? `Requires ${required}`}>
        <Button
          ref={ref}
          aria-disabled="true"
          className={cn("cursor-not-allowed opacity-50", className)}
          onClick={(event) => {
            event.preventDefault();
          }}
          {...props}
        />
      </Tooltip>
    );
  },
);
