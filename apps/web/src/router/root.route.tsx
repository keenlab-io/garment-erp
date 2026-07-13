import { createRootRouteWithContext } from "@tanstack/react-router";
import { Shell } from "../shell/Shell";
import type { RouterContext } from "./context";

/** Root route — carries the injected session context and renders the persistent shell. */
export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Shell,
});
