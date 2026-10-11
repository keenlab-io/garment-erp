import { Outlet, useRouterState } from "@tanstack/react-router";
import { ToastProvider, TooltipProvider } from "@erp/ui";
import { useSession } from "../session/session-context";
import { DensityProvider } from "../density/density-context";
import { AppChrome } from "./AppChrome";

/**
 * The persistent shell — the root route's component, so it never remounts on child navigation.
 * Density lives here (inside the router, so it can read the active route's kiosk flag). When there
 * is no session, only the content region renders (the login route) with no navigation chrome.
 */
export function Shell() {
  const { user } = useSession();
  // The platform console (M8 §7.1) is a separate principal with its own chrome — never wrap it in
  // the tenant `AppChrome`, even when a tenant user happens to be signed in in the same browser.
  const isPlatform = useRouterState({ select: (s) => s.location.pathname.startsWith("/platform") });

  return (
    <DensityProvider>
      <TooltipProvider delayDuration={300}>
        <ToastProvider>{user && !isPlatform ? <AppChrome /> : <Outlet />}</ToastProvider>
      </TooltipProvider>
    </DensityProvider>
  );
}
