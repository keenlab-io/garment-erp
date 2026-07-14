import type { Theme } from "@erp/design-tokens";

/** localStorage key holding the user's explicit theme choice (absent = follow the system). */
export const THEME_STORAGE_KEY = "erp.theme";

/**
 * Resolve the initial theme: an explicit stored choice always wins; otherwise follow the OS
 * `prefers-color-scheme`. The token CSS has no automatic `prefers-color-scheme` rule (light is the
 * `:root` default), so the system preference must be applied here in JS.
 */
export function resolveInitialTheme(stored: Theme | null, systemPrefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return systemPrefersDark ? "dark" : "light";
}
