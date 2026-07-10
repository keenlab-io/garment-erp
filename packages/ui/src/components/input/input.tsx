import * as React from "react";
import { Search, Eye, EyeOff } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { controlSizing } from "../../lib/control.js";
import { Icon } from "../icon/icon.js";

/**
 * Wrapper surface for an input with adornments: the ring reacts to `focus-within` and the danger
 * border/ring react to an `aria-invalid` input inside (set by `FormField`) via `has-*`.
 */
const inputWrapper = cn(
  "flex w-full items-center gap-2 rounded-md border border-border bg-bg-surface text-text-primary font-sans",
  "focus-within:outline-none focus-within:ring-2 focus-within:ring-border-focus focus-within:ring-offset-1 focus-within:ring-offset-bg-app",
  "has-[input[aria-invalid=true]]:border-danger has-[input[aria-invalid=true]]:ring-danger",
  "has-[input:disabled]:opacity-50",
);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * `search` adds a leading magnifier; `password` adds a reveal toggle; `number` right-aligns with
   * tabular numerals. All other native input types render plainly.
   */
  type?: React.HTMLInputTypeAttribute;
}

/**
 * The owned text input. One component covers the text / number / password / search shapes: number
 * is right-aligned tabular, password gets a reveal toggle, search gets a leading icon. Sized by the
 * density control tokens; the invalid state is driven by `aria-invalid` (wired by `FormField`).
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { type = "text", className, style, disabled, ...props },
  ref,
) {
  const [revealed, setRevealed] = React.useState(false);
  const isPassword = type === "password";
  const isSearch = type === "search";
  const isNumber = type === "number";
  const resolvedType = isPassword && revealed ? "text" : type;

  return (
    <div className={cn(inputWrapper, className)} style={{ ...controlSizing, ...style }}>
      {isSearch && <Icon icon={Search} className="text-text-muted" aria-hidden />}
      <input
        ref={ref}
        type={resolvedType}
        disabled={disabled}
        className={cn(
          "w-full bg-transparent text-text-primary outline-none placeholder:text-text-muted disabled:cursor-not-allowed",
          isNumber && "text-right font-numeric tabular-nums",
        )}
        {...props}
      />
      {isPassword && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setRevealed((v) => !v)}
          disabled={disabled}
          aria-label={revealed ? "Hide password" : "Show password"}
          className="shrink-0 text-text-muted hover:text-text-primary focus-visible:text-text-primary focus-visible:outline-none"
        >
          <Icon icon={revealed ? EyeOff : Eye} aria-hidden />
        </button>
      )}
    </div>
  );
});
