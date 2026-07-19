import * as React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Badge, Button, FormField, Input } from "@erp/ui";
import { useLoginMutation } from "../../session/use-login.js";
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
 * The real `/login` screen (M1 §4.1, MD1): a credential form against the `iam` auth endpoint.
 * `useLoginMutation` exchanges the credentials for a token pair, stores it, fetches `/auth/me`, and
 * commits the resulting `AuthUser` to the session — success just navigates home. The `notice` banner
 * is the M1 §2.2 401/stale-permissions interceptor routing here after clearing a dead session (the
 * same screen doubles as the re-auth flow: there is no separate "re-authenticate" screen).
 */
export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notice } = useSearch({ from: "/login" });
  const login = useLoginMutation();

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    login.mutate(
      { username, password },
      { onSuccess: () => void navigate({ to: "/" }) },
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-app p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-bg-surface p-8 text-center shadow-md"
      >
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
        {login.isError && (
          <Badge tone="danger" className="mt-4">
            {t("login.invalidCredentials")}
          </Badge>
        )}

        <div className="mt-6 flex flex-col gap-4 text-left">
          <FormField label={t("login.usernameLabel")}>
            <Input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </FormField>
          <FormField label={t("login.passwordLabel")}>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
        </div>

        <Button
          type="submit"
          className="mt-6 w-full"
          loading={login.isPending}
          disabled={!username || !password}
        >
          {login.isPending ? t("login.submitting") : t("login.submit")}
        </Button>
      </form>
    </div>
  );
}
