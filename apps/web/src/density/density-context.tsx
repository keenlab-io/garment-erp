import * as React from "react";
import { useMatches } from "@tanstack/react-router";
import type { Density } from "@erp/design-tokens";
import { resolveDensity, type DensityPref, DENSITY_STORAGE_KEY } from "./resolve-density";

interface DensityContextValue {
  /** The effective density applied to the document. */
  density: Density;
  /** True in Touch mode — components use this to drop hover-only affordances. */
  isTouch: boolean;
  /** The user's Comfortable/Compact preference (null = auto). */
  pref: DensityPref | null;
  /** Set the Comfortable/Compact preference (ignored where a kiosk route forces Touch). */
  setPref: (pref: DensityPref) => void;
}

const DensityContext = React.createContext<DensityContextValue | null>(null);

const COARSE_QUERY = "(pointer: coarse)";

function readStoredPref(): DensityPref | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
  return stored === "comfortable" || stored === "compact" ? stored : null;
}

function coarsePointer(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(COARSE_QUERY).matches;
}

/**
 * Sets `data-density` on the document root. Comfortable is the default, Compact is a persisted user
 * toggle, and Touch is auto-applied on kiosk-flagged routes (from route metadata, non-overridable)
 * or coarse-pointer devices. Must render inside the router so it can read the active route's kiosk
 * flag; writes to `<html>` so portaled overlays inherit the density tokens.
 */
export function DensityProvider({ children }: { children: React.ReactNode }) {
  const matches = useMatches();
  const kioskActive = matches.some((m) => m.staticData?.kiosk === true);

  const [pref, setPrefState] = React.useState<DensityPref | null>(readStoredPref);
  const [coarse, setCoarse] = React.useState<boolean>(coarsePointer);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(COARSE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setCoarse(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const density = resolveDensity({ kioskActive, userPref: pref, coarsePointer: coarse });

  React.useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  const value = React.useMemo<DensityContextValue>(
    () => ({
      density,
      isTouch: density === "touch",
      pref,
      setPref: (next: DensityPref) => {
        setPrefState(next);
        if (typeof window !== "undefined") window.localStorage.setItem(DENSITY_STORAGE_KEY, next);
      },
    }),
    [density, pref],
  );

  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

export function useDensity(): DensityContextValue {
  const ctx = React.useContext(DensityContext);
  if (!ctx) throw new Error("useDensity must be used within a <DensityProvider>");
  return ctx;
}
