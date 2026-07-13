import { useTranslation } from "react-i18next";
import { Badge, Skeleton } from "@erp/ui";
import { api } from "../../api/client";

/**
 * Landing page. M0 shows a token-styled API-health panel (proving the shell renders real data
 * through the /api proxy) and an invoices placeholder — the invoice table lands on the Data Table
 * in a later M0 group.
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const health = api.health.check.useQuery(["health"]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">
        {t("dashboard.title")}
      </h1>

      <section className="rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-body-strong text-text-primary">{t("dashboard.apiHealth")}</h2>
        {health.isLoading ? (
          <Skeleton className="w-48" />
        ) : health.isError ? (
          <Badge tone="danger">{t("dashboard.unreachable")}</Badge>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="success">{t("dashboard.healthy")}</Badge>
            <span className="text-sm text-text-secondary">
              {t("dashboard.uptime", { seconds: health.data?.body.uptime.toFixed(1) })}
            </span>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-body-strong text-text-primary">{t("dashboard.invoices")}</h2>
        <p className="text-sm text-text-muted">{t("dashboard.invoicesEmpty")}</p>
      </section>
    </div>
  );
}
