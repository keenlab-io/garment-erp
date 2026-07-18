import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Badge, Button } from "@erp/ui";
import { useSession } from "../../session/session-context";
import { BrandMark } from "../../shell/BrandMark";

/** The reason `/login` was reached via a forced sign-out, carried as a search param (M1 §2.2). */
export type LoginNotice = "reauth" | "session-expired";

export interface LoginSearch {
  notice?: LoginNotice;
}

/** No zod in `apps/web` — a plain type guard keeps the search param typed without a new dependency. */
export function validateLoginSearch(search: Record<string, unknown>): LoginSearch {
  const { notice } = search;
  return notice === "reauth" || notice === "session-expired" ? { notice } : {};
}

/**
 * Placeholder login. M0 ships the session-context seam; the real credential form against the IAM
 * contract lands with M1 §4.1. "Continue" restores the dev session and returns to the app. The
 * `notice` banner is real: the M1 §2.2 401/stale-permissions interceptor routes here with it after
 * clearing a dead session.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const { signIn } = useSession();
  const navigate = useNavigate();
  const { notice } = useSearch({ from: "/login" });

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-app p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-bg-surface p-8 text-center shadow-md">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        <h1 className="font-display text-h2 font-semibold text-text-primary">{t("login.title")}</h1>
        <p className="mt-2 text-sm text-text-secondary">{t("login.subtitle")}</p>
        {notice && (
          <Badge tone="warning" className="mt-4">
            {t(notice === "reauth" ? "login.noticeReauth" : "login.noticeSessionExpired")}
          </Badge>
        )}
        <Button
          className="mt-6 w-full"
          onClick={() => {
            signIn();
            void navigate({ to: "/" });
          }}
        >
          {t("login.continue")}
        </Button>
      </div>
    </div>
  );
}
