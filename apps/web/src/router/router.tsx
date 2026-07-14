import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./route-tree";
import type { RouterContext } from "./context";

// A default context satisfies the type at creation; the live session is injected by RouterProvider
// (see main.tsx). Guards only ever read the injected value.
const defaultContext: RouterContext = {
  session: {
    user: null,
    isSuperAdmin: false,
    hasPermission: () => false,
    signIn: () => {},
    signOut: () => {},
  },
};

export const router = createRouter({
  routeTree,
  context: defaultContext,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
