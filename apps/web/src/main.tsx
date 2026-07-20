import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";
import "@erp/ui/fonts";
import "./styles.css";
import i18next from "./i18n/i18n";
import { ThemeProvider } from "./theme/theme-context";
import { LocaleProvider } from "./i18n/locale-context";
import { SessionProvider, useSession } from "./session/session-context";
import { onUnauthorized } from "./api/auth-events";
import { router } from "./router/router";

const queryClient = new QueryClient();

// Threads the live session into the router so `beforeLoad` guards read it synchronously. Also owns
// the M1 §2.2 401/stale-permissions interceptor: the api client sits outside the React tree, so it
// just raises `notifyUnauthorized`; this is where that becomes "clear the session and route to
// /login with a notice".
function InnerRouter() {
  const session = useSession();

  React.useEffect(() => {
    onUnauthorized((reason) => {
      session.signOut();
      void router.navigate({
        to: "/login",
        search: { notice: reason === "REAUTH_REQUIRED" ? "reauth" : "session-expired" },
      });
    });
    return () => onUnauthorized(null);
  }, [session]);

  return <RouterProvider router={router} context={{ session }} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Explicit context, not just react-i18next's global-instance fallback — so @erp/ui's own
        `useTranslation()` calls (DataTable, ConfirmDialog, Dialog, Toast) deterministically consume
        this app's instance rather than relying on module-singleton registration order (M0 §7.1). */}
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LocaleProvider>
            {/* Boot logged-out: real M1 auth is live, so a fresh load goes straight to /login and
                the user logs in for a real JWT. Seeding the M0 dev-stub super-admin here would fake
                a tokenless session that every authenticated API call 401s — bouncing to /login with
                a misleading "session expired". The dev-stub (createDevUser / VITE_DEV_PERMISSIONS)
                stays available for nav-filter demos; it's just no longer auto-seeded. */}
            <SessionProvider initialUser={null}>
              <InnerRouter />
            </SessionProvider>
          </LocaleProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </React.StrictMode>,
);
