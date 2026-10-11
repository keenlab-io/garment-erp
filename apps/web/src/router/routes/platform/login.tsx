import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Badge, Button, FormField, Input } from "@erp/ui";
import { BrandMark } from "../../../shell/BrandMark";
import { usePlatformLoginMutation } from "../../../platform/queries.js";
import { usePlatformSignedIn } from "../../../platform/use-platform-session.js";

/**
 * The platform_admin sign-in (M8 §7.1). Authenticates against `POST /platform/auth/login` — a
 * separate principal from tenant users — and, once the platform token is held, goes to the tenants
 * list. Like the tenant `/login`, it sits outside any guard (guarding it would loop).
 */
export function PlatformLoginPage() {
  const { t } = useTranslation("platform");
  const navigate = useNavigate();
  const login = usePlatformLoginMutation();
  const signedIn = usePlatformSignedIn();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  React.useEffect(() => {
    if (signedIn) void navigate({ to: "/platform/tenants" });
  }, [signedIn, navigate]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    login.mutate({ email, password });
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
        {login.isError && (
          <Badge tone="danger" className="mt-4">
            {t("login.invalid")}
          </Badge>
        )}
        <div className="mt-6 flex flex-col gap-4 text-left">
          <FormField label={t("login.emailLabel")}>
            <Input
              autoFocus
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
        <Button type="submit" className="mt-6 w-full" loading={login.isPending} disabled={!email || !password}>
          {login.isPending ? t("login.submitting") : t("login.submit")}
        </Button>
      </form>
    </div>
  );
}
