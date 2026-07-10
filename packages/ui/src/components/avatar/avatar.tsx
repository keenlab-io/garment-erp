import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "../../lib/cn.js";

const SIZES = {
  sm: "size-6 text-caption",
  md: "size-8 text-sm",
  lg: "size-9 text-body",
} as const;

export interface AvatarProps
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> {
  size?: keyof typeof SIZES;
  /** Image URL; falls back to `initials` (or a neutral placeholder) if it fails to load. */
  src?: string;
  /** Alt text for the image and label for the fallback. */
  name?: string;
  /** Initials shown when there is no image. */
  initials?: string;
}

/** A user avatar on Radix — an image that gracefully falls back to initials on a neutral chip. */
export const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(function Avatar({ size = "md", src, name, initials, className, ...props }, ref) {
  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-bg-sunken text-text-secondary",
        SIZES[size],
        className,
      )}
      {...props}
    >
      {src && (
        <AvatarPrimitive.Image src={src} alt={name ?? ""} className="size-full object-cover" />
      )}
      <AvatarPrimitive.Fallback
        delayMs={src ? 300 : 0}
        className="flex size-full items-center justify-center font-medium"
      >
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
});
