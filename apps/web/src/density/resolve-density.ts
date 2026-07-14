import type { Density } from "@erp/design-tokens";

/** The only two densities a user can pick manually — Touch is auto-applied, never chosen. */
export type DensityPref = "comfortable" | "compact";

/** localStorage key holding the user's Comfortable/Compact preference (absent = auto). */
export const DENSITY_STORAGE_KEY = "erp.density";

/**
 * Resolve the effective density.
 *
 * Precedence: a kiosk/floor route forces Touch and cannot be overridden; otherwise an explicit
 * user preference (Comfortable/Compact) wins; otherwise a coarse pointer defaults to Touch; else
 * Comfortable. Detection is a heuristic, route flags are truth.
 */
export function resolveDensity(input: {
  kioskActive: boolean;
  userPref: DensityPref | null;
  coarsePointer: boolean;
}): Density {
  if (input.kioskActive) return "touch";
  if (input.userPref) return input.userPref;
  return input.coarsePointer ? "touch" : "comfortable";
}
