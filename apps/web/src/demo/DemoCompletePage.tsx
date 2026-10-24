import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Checkbox } from "@erp/ui";
import { api } from "../api/client.js";
import { clearTokens, setTokens } from "../api/token-store.js";
import { authUserFromMe } from "../session/auth-user-from-me.js";
import { useSession } from "../session/session-context.js";
import { BrandMark } from "../shell/BrandMark";
import { DemoDeletionNotice } from "./DemoNotice";
import { parseOidcFragment, setDemoMode, type OidcCompletion } from "./demo-mode.js";

/**
 * The post-callback entry screen (M10 §6.2). The api redirects here with the token pair in the URL
 * fragment; we read it once, scrub it from the address bar, repeat the deletion notice and offer the
 * **unchecked** PDPA lead opt-in. Only "Enter the demo" stores the tokens and commits the session
 * (the same `token-store` + `session-context` flow as password login).
 */
export function DemoCompletePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { signIn, user } = useSession();

  const [completion] = React.useState<OidcCompletion | null>(() => parseOidcFragment(window.location.hash));
  const [optIn, setOptIn] = React.useState(false);
  const [entering, setEntering] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  // Never leave tokens sitting in the address bar / history.
  React.useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  // Navigate once the committed session has propagated into the router context (see LoginPage).
  React.useEffect(() => {
    if (user && completion) void navigate({ to: completion.returnTo });
  }, [user, completion, navigate]);

  async function enter() {
    if (!completion) return;
    setEntering(true);
    setFailed(false);
    try {
      setTokens({ accessToken: completion.accessToken, refreshToken: completion.refreshToken });
      if (completion.demo) {
        const entry = await api.demo.entry.mutation({ body: { lead_opt_in: optIn } });
        if (entry.status !== 200) throw entry;
      }
      const me = await api.iam.me.query();
      if (me.status !== 200) throw me;
      setDemoMode(completion.demo);
      queryClient.clear();
      signIn(authUserFromMe(me.body));
    } catch {
      clearTokens();
      setDemoMode(false);
      setFailed(true);
      setEntering(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-app p-6">
      <div className="w-full max-w-lg rounded-lg border border-border bg-bg-surface p-8 text-center shadow-md">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        {completion ? (
          <>
            <h1 className="font-display text-h2 font-semibold text-text-primary">{t("demo.entryTitle")}</h1>
            <div className="mt-6">
              <DemoDeletionNotice />
            </div>
            {completion.demo && (
              <label className="mt-6 flex cursor-pointer items-start gap-3 text-left text-sm text-text-primary">
                <Checkbox
                  checked={optIn}
                  onCheckedChange={(v) => setOptIn(v === true)}
                  aria-label={t("demo.entryLeadOptIn")}
                />
                <span>{t("demo.entryLeadOptIn")}</span>
              </label>
            )}
            {failed && (
              <Badge tone="danger" className="mt-4">
                {t("demo.entryError")}
              </Badge>
            )}
            <Button className="mt-6 w-full" loading={entering} onClick={() => void enter()}>
              {entering ? t("demo.entryEntering") : t("demo.entryEnter")}
            </Button>
          </>
        ) : (
          <>
            <Badge tone="danger">{t("demo.entryInvalid")}</Badge>
            <Button asChild variant="secondary" className="mt-6 w-full">
              <a href="/demo">{t("demo.entryBackToStart")}</a>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
