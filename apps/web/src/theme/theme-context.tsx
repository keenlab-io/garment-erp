import * as React from "react";
import type { Theme } from "@erp/design-tokens";
import { resolveInitialTheme, THEME_STORAGE_KEY } from "./resolve-theme";

interface ThemeContextValue {
  /** The theme currently applied to the document. */
  theme: Theme;
  /** Set an explicit theme; it persists and stops following the OS preference. */
  setTheme: (theme: Theme) => void;
  /** Flip between light and dark (an explicit choice). */
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(DARK_QUERY).matches;
}

/**
 * Applies `data-theme` to the document root. Default follows the OS `prefers-color-scheme`; an
 * explicit user choice wins and persists across sessions. The attribute lives on `<html>` (not a
 * shell wrapper) so portaled overlays (dialogs, drawers, toasts, the command palette) inherit it.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = React.useState<Theme | null>(readStoredTheme);
  const [systemDark, setSystemDark] = React.useState<boolean>(systemPrefersDark);

  // React to OS changes only while the user has not made an explicit choice.
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const theme = resolveInitialTheme(preference, systemDark);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const value = React.useMemo<ThemeContextValue>(() => {
    const setTheme = (next: Theme) => {
      setPreference(next);
      if (typeof window !== "undefined") window.localStorage.setItem(THEME_STORAGE_KEY, next);
    };
    return {
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    };
  }, [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a <ThemeProvider>");
  return ctx;
}
