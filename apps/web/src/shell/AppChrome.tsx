import * as React from "react";
import { Outlet, useMatches } from "@tanstack/react-router";
import { CommandPaletteProvider } from "../command-palette/command-context";
import { CommandPalette } from "../command-palette/CommandPalette";
import { useCommandKeymap } from "../command-palette/useCommandKeymap";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileTabBar } from "./MobileTabBar";
import { NavDrawer } from "./NavDrawer";

function ChromeLayout() {
  const [navOpen, setNavOpen] = React.useState(false);
  useCommandKeymap();

  return (
    <div id="shell" className="flex h-screen bg-bg-app text-text-primary">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
        <MobileTabBar onOpenNav={() => setNavOpen(true)} />
      </div>
      <NavDrawer open={navOpen} onOpenChange={setNavOpen} />
      <CommandPalette />
    </div>
  );
}

/**
 * The authenticated frame: ink sidebar (md+) or bottom tab bar + drawer (mobile), a persistent top
 * bar, and the content outlet. The command-palette provider scopes the ⌘K search to signed-in
 * chrome; the shell itself never remounts on navigation (only the outlet does).
 *
 * A route flagged `kioskLockdown` (design MD2 — the production scan station) drops all of that:
 * no sidebar, top bar, tab bar, drawer, or ⌘K palette — just the outlet, full screen. "No nav" is
 * the exit condition too: there's nothing left to tap out of Touch through.
 */
export function AppChrome() {
  const matches = useMatches();
  const kioskLockdown = matches.some((m) => m.staticData?.kioskLockdown === true);

  if (kioskLockdown) {
    return (
      <main id="shell" className="h-screen overflow-auto bg-bg-app p-4 text-text-primary md:p-6">
        <Outlet />
      </main>
    );
  }

  return (
    <CommandPaletteProvider>
      <ChromeLayout />
    </CommandPaletteProvider>
  );
}
