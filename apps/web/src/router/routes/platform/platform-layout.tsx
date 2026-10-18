import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@erp/ui";
import { BrandMark } from "../../../shell/BrandMark";
import { usePlatformSignedIn } from "../../../platform/use-platform-session.js";
import { platformSignOut } from "../../../platform/queries.js";

/**
 * The chrome around every platform console screen (M8 §7.1) — deliberately not the tenant
 * `AppChrome`: no module nav, no tenant permissions, just the two control-plane areas and sign-out.
 * It also owns the "session died" redirect: a 401 clears the platform token (see
 * `platform-client`), and this effect routes back to the platform login.
 */
export function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("platform");
  const navigate = useNavigate();
  const signedIn = usePlatformSignedIn();

  React.useEffect(() => {
    if (!signedIn) void navigate({ to: "/platform/login" });
  }, [signedIn, navigate]);

  if (!signedIn) return null;

  return (
    <div className="flex min-h-screen flex-col bg-bg-app">
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-border bg-bg-surface px-6">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="font-display text-sm font-semibold text-text-secondary">{t("nav.brand")}</span>
        </div>
        <nav className="flex flex-1 items-center gap-4 text-sm">
          <Link to="/platform/tenants" className="text-text-link" activeProps={{ className: "font-semibold" }}>
            {t("nav.tenants")}
          </Link>
          <Link to="/platform/quotes" className="text-text-link" activeProps={{ className: "font-semibold" }}>
            {t("nav.quotes")}
          </Link>
          <Link
            to="/platform/support-sessions"
            className="text-text-link"
            activeProps={{ className: "font-semibold" }}
          >
            {t("nav.supportSessions")}
          </Link>
        </nav>
        <Button variant="ghost" onClick={() => void platformSignOut()}>
          {t("nav.signOut")}
        </Button>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
