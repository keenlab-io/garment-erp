import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import "@erp/ui/fonts";
import "./styles.css";
import "./i18n/i18n";
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
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LocaleProvider>
          <SessionProvider>
            <InnerRouter />
          </SessionProvider>
        </LocaleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
