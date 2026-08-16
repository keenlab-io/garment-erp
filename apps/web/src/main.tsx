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
import { restoreSession } from "./session/restore-session";
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

// Silently re-establish the session from the persisted refresh token before the first render, so a
// page reload restores an authenticated user instead of flashing `/login`. A logged-out or expired
// session resolves to `null` and boots straight to the login screen. Route guards read the session
// synchronously via router context, so this must settle before the router mounts (hence bootstrap
// awaits it — an async IIFE rather than top-level await, which the build target doesn't support).
async function bootstrap() {
  const restoredUser = await restoreSession();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      {/* Explicit context, not just react-i18next's global-instance fallback — so @erp/ui's own
          `useTranslation()` calls (DataTable, ConfirmDialog, Dialog, Toast) deterministically consume
          this app's instance rather than relying on module-singleton registration order (M0 §7.1). */}
      <I18nextProvider i18n={i18next}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <LocaleProvider>
              {/* Seed with the restored user (or `null` when there's no valid session). Real M1 auth
                  is live, so with no persisted refresh token a fresh load goes to /login; with one, the
                  silent refresh above re-seeds a real JWT-backed session. The dev-stub (createDevUser /
                  VITE_DEV_PERMISSIONS) stays available for nav-filter demos; it's just not auto-seeded. */}
              <SessionProvider initialUser={restoredUser}>
                <InnerRouter />
              </SessionProvider>
            </LocaleProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
