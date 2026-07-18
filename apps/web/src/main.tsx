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
import { router } from "./router/router";

const queryClient = new QueryClient();

// Threads the live session into the router so `beforeLoad` guards read it synchronously.
function InnerRouter() {
  const session = useSession();
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
            <SessionProvider>
              <InnerRouter />
            </SessionProvider>
          </LocaleProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </React.StrictMode>,
);
