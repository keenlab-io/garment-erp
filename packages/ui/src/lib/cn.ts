import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class lists and resolve conflicting Tailwind utilities (last wins).
 * The shared class helper every @erp/ui component uses.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Re-export the CVA variant primitive so components define variants from one place.
export { cva, type VariantProps } from "class-variance-authority";
