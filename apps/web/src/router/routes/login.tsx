import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@erp/ui";
import { useSession } from "../../session/session-context";
import { BrandMark } from "../../shell/BrandMark";

/**
 * Placeholder login. M0 ships the session-context seam; the real login against the IAM contract
 * lands with M1. "Continue" restores the dev session and returns to the app.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const { signIn } = useSession();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-app p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-bg-surface p-8 text-center shadow-md">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        <h1 className="font-display text-h2 font-semibold text-text-primary">{t("login.title")}</h1>
        <p className="mt-2 text-sm text-text-secondary">{t("login.subtitle")}</p>
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
