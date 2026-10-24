import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";
import { Button, Icon, useToast } from "@erp/ui";
import { api } from "../api/client.js";
import { clearTokens } from "../api/token-store.js";
import { useSession } from "../session/session-context.js";
import { setDemoMode, useDemoMode } from "./demo-mode.js";

/**
 * The persistent demo-mode banner (M10 §6.3), rendered inside the shell for sandbox sessions only.
 * "End demo & delete my data" calls `POST /demo/end` (revokes the sessions and triggers the purge),
 * then clears the local tokens and returns to the demo landing page.
 */
export function DemoBanner() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const session = useSession();
  const demo = useDemoMode();
  const [ending, setEnding] = React.useState(false);

  if (!demo) return null;

  async function endDemo() {
    setEnding(true);
    try {
      const res = await api.demo.end.mutation({});
      if (res.status !== 200) throw res;
      // Clear first so signOut() doesn't fire a logout with an already-revoked token.
      clearTokens();
      setDemoMode(false);
      session.signOut();
      void navigate({ to: "/demo" });
    } catch {
      setEnding(false);
      toast({ tone: "danger", title: t("demo.endError") });
    }
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-b border-info bg-info-subtle px-4 py-2 text-sm text-info-on"
    >
      <Icon icon={FlaskConical} size={16} />
      <span className="flex-1">{t("demo.bannerText")}</span>
      <Button variant="secondary" loading={ending} onClick={() => void endDemo()}>
        {ending ? t("demo.endingDemo") : t("demo.endDemo")}
      </Button>
    </div>
  );
}
