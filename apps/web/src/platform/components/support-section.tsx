import * as React from "react";
import { useTranslation } from "react-i18next";
import { SupportSessionScope, type SupportSessionCreated, type TenantListItem } from "@erp/contracts";
import {
  Button,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@erp/ui";
import { useDateFormat } from "../../i18n/use-formatters.js";
import { useCreateSupportSessionMutation } from "../queries.js";

/**
 * Starts a support session (M8 §7.1, design D8). The reason is mandatory and the api records it in
 * both ledgers; the minted access token is shown once. Ending sessions lives on the Support sessions screen.
 */
export function SupportSection({ tenant }: { tenant: TenantListItem }) {
  const { t } = useTranslation("platform");
  const dateFormat = useDateFormat({ dateStyle: "medium", timeStyle: "short" });
  const create = useCreateSupportSessionMutation();

  const [reason, setReason] = React.useState("");
  const [scope, setScope] = React.useState<SupportSessionScope>(SupportSessionScope.READ_ONLY);
  const [minutes, setMinutes] = React.useState("");
  const [started, setStarted] = React.useState<SupportSessionCreated | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsedMinutes = Number.parseInt(minutes, 10);
    create.mutate(
      {
        body: {
          tenant_id: tenant.id,
          reason,
          scope,
          ...(Number.isInteger(parsedMinutes) && parsedMinutes > 0 ? { minutes: parsedMinutes } : {}),
        },
      },
      {
        onSuccess: (result) => {
          setStarted(result.body);
          setReason("");
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
      <h2 className="text-body-strong text-text-primary">{t("support.heading")}</h2>
      <p className="text-sm text-text-secondary">{t("support.hint")}</p>

      {started && (
        <div role="status" className="flex flex-col gap-2 rounded-md border border-success bg-success-subtle p-3 text-sm text-success-on">
          <p className="font-semibold">{t("support.startedTitle")}</p>
          <p>
            {t("support.startedBody", {
              expires: dateFormat.format(new Date(started.support_session.expires_at)),
            })}
          </p>
          <FormField label={t("support.accessToken")}>
            <Input readOnly value={started.access_token} className="font-mono" />
          </FormField>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {create.isError && (
          <p role="alert" className="text-sm text-danger">
            {t("support.error")}
          </p>
        )}
        <FormField label={t("support.reason")} required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
        </FormField>
        <FormField label={t("support.scope")}>
          <Select value={scope} onValueChange={(v) => setScope(v as SupportSessionScope)}>
            <SelectTrigger aria-label={t("support.scope")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SupportSessionScope.READ_ONLY}>{t("support.scopeReadOnly")}</SelectItem>
              <SelectItem value={SupportSessionScope.FULL}>{t("support.scopeFull")}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={t("support.minutes")}>
          <Input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </FormField>
        <div>
          <Button type="submit" loading={create.isPending} disabled={!reason.trim()}>
            {t("support.start")}
          </Button>
        </div>
      </form>
    </section>
  );
}
