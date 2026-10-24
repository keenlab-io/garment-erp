import * as React from "react";

/** localStorage key marking that the stored session is a demo sandbox (survives reload, like the refresh token). */
export const DEMO_MODE_STORAGE_KEY = "erp.demo_mode";

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === "1";
}

/** Flag (or unflag) the current session as a demo sandbox. Set by the OIDC completion route. */
export function setDemoMode(on: boolean): void {
  if (on) window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, "1");
  else window.localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the signed-in session is a demo sandbox — drives the banner and demo labels. */
export function useDemoMode(): boolean {
  return React.useSyncExternalStore(subscribe, isDemoMode, () => false);
}

/** The parsed `/auth/oidc/complete` URL fragment (`access_token`, `refresh_token`, `return_to`, `demo`). */
export interface OidcCompletion {
  accessToken: string;
  refreshToken: string;
  returnTo: string;
  demo: boolean;
}

export function parseOidcFragment(hash: string): OidcCompletion | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  const returnTo = params.get("return_to") ?? "/";
  // Only same-origin paths — never an open redirect.
  const safeReturn = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  return { accessToken, refreshToken, returnTo: safeReturn, demo: params.get("demo") === "1" };
}
