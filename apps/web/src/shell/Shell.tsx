import { Outlet } from "@tanstack/react-router";
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

  return (
    <DensityProvider>
      <TooltipProvider delayDuration={300}>
        <ToastProvider>{user ? <AppChrome /> : <Outlet />}</ToastProvider>
      </TooltipProvider>
    </DensityProvider>
  );
}
