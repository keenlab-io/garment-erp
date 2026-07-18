import * as React from "react";
import { Lock } from "lucide-react";
import type { Permission } from "@erp/contracts";
import { cn } from "../../lib/cn.js";
import { Icon } from "../icon/icon.js";
import { usePermissions } from "./permissions-context.js";

export interface MaskedValueProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** The permission that reveals the value; masked whenever the viewer lacks it. */
  permission: Permission;
  /** The real value — only ever mounted when the viewer holds `permission`. */
  value: React.ReactNode;
  /** Screen-reader text explaining the mask; defaults to naming the required permission. */
  restrictedLabel?: string;
}

/**
 * Renders a sensitive field as `••••` + a lock icon when the viewer lacks `permission` (e.g.
 * `hr.salary.view`, `inventory.cost.view`), else the real `value` — same layout slot either way, so
 * a screen's field positions never shift based on who's viewing it. When masked, `value` is never
 * passed into the render tree, so the real figure is never present in the DOM to inspect or copy;
 * masking is a UX affordance only — the API must not have sent the value in the first place.
 */
export function MaskedValue({ permission, value, restrictedLabel, className, ...props }: MaskedValueProps) {
  const { has } = usePermissions();
  const allowed = has(permission);
  const description = restrictedLabel ?? `Restricted — requires ${permission}`;

  return (
    <span
      className={cn("inline-flex min-w-[3.5em] items-center gap-1 font-numeric tabular-nums", className)}
      {...props}
    >
      {allowed ? (
        value
      ) : (
        <>
          <Icon icon={Lock} size={14} className="text-text-secondary" aria-hidden />
          <span aria-hidden>••••</span>
          <span className="sr-only">{description}</span>
        </>
      )}
    </span>
  );
}
