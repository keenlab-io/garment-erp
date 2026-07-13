import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cva, type VariantProps } from "../../lib/cn.js";
import { cn } from "../../lib/cn.js";

const buttonVariants = cva(
  cn(
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-sans font-medium",
    "transition-colors ease-standard",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-border-focus focus-visible:ring-offset-bg-app",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-[busy=true]:pointer-events-none",
  ),
  {
    variants: {
      variant: {
        primary: "bg-accent text-text-inverse hover:bg-accent-hover active:bg-accent-hover",
        secondary:
          "border border-border bg-bg-surface text-text-primary hover:bg-bg-sunken active:bg-bg-sunken",
        ghost: "text-text-primary hover:bg-bg-sunken active:bg-bg-sunken",
        destructive: "bg-danger text-text-inverse hover:opacity-90 active:opacity-90",
        icon: "aspect-square border border-border bg-bg-surface text-text-primary hover:bg-bg-sunken active:bg-bg-sunken",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
);

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

interface ButtonBaseProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Render the child element as the button (Radix Slot) — for link-buttons etc. */
  asChild?: boolean;
  /** Show a spinner, set `aria-busy`, and ignore further interaction. */
  loading?: boolean;
}

interface ButtonLabelledProps extends ButtonBaseProps {
  variant?: Exclude<ButtonVariant, "icon">;
  "aria-label"?: string;
}

/** Icon-only buttons have no text, so an `aria-label` is required at the type level. */
interface ButtonIconProps extends ButtonBaseProps {
  variant: "icon";
  "aria-label": string;
}

export type ButtonProps = ButtonLabelledProps | ButtonIconProps;

/**
 * The owned button. Variants + states are CVA (semantic tokens only); height, inline padding, and
 * the minimum hit target come from the density tokens so one component serves office and shop-floor
 * densities. Loading is non-interactive and announced via `aria-busy`. Icon-only requires an
 * `aria-label` — omitting it is a compile error.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading = false, asChild = false, className, children, style, onClick, disabled, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  const isIcon = variant === "icon";
  const inert = loading || disabled;

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (inert) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant }), className)}
      style={{
        height: "var(--density-control-h)",
        minHeight: "var(--density-tap-min)",
        paddingInline: isIcon ? undefined : "var(--density-pad-x)",
        width: isIcon ? "var(--density-control-h)" : undefined,
        minWidth: isIcon ? "var(--density-tap-min)" : undefined,
        ...style,
      }}
      disabled={asChild ? undefined : disabled}
      aria-busy={loading || undefined}
      aria-disabled={inert || undefined}
      onClick={handleClick}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && (
            <Loader2
              aria-hidden
              className="animate-spin"
              style={{ width: "var(--density-icon)", height: "var(--density-icon)" }}
            />
          )}
          {children}
        </>
      )}
    </Comp>
  );
});

export { buttonVariants };
