import { useTranslation } from "react-i18next";
import { API_PREFIX } from "@erp/contracts";
import { Badge, Button } from "@erp/ui";
import { api } from "../api/client.js";
import { BrandMark } from "../shell/BrandMark";
import { DemoDeletionNotice } from "./DemoNotice";

/** Where "Continue with Google" sends the browser — the api's OIDC start redirect (M10 §4). */
export const OIDC_GOOGLE_START_HREF = `${API_PREFIX}/auth/oidc/google/start`;

const demoStatusKey = ["public", "demo-status"] as const;

/**
 * The demo-host landing page (M10 §6.1): product blurb, availability from `GET /demo/status`
 * (a busy pool shows the friendly "try again shortly" message instead of the sign-in), and the
 * deletion notice before the guest can start.
 */
export function DemoLandingPage() {
  const { t } = useTranslation();
  const status = api.demo.status.useQuery(demoStatusKey, undefined, { queryKey: demoStatusKey, retry: false });
  const body = status.data?.status === 200 ? status.data.body : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-app p-6">
      <div className="w-full max-w-lg rounded-lg border border-border bg-bg-surface p-8 text-center shadow-md">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        <h1 className="font-display text-h2 font-semibold text-text-primary">{t("demo.landingTitle")}</h1>
        <p className="mt-3 text-sm text-text-secondary">{t("demo.landingBlurb")}</p>

        <div className="mt-6">
          <DemoDeletionNotice />
        </div>

        <div className="mt-6">
          {status.isPending ? (
            <p className="text-sm text-text-muted">{t("demo.checking")}</p>
          ) : body?.available ? (
            <Button asChild className="w-full">
              <a href={OIDC_GOOGLE_START_HREF}>{t("demo.continueWithGoogle")}</a>
            </Button>
          ) : (
            <Badge tone="warning">{body?.busy ? t("demo.busy") : t("demo.unavailable")}</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
