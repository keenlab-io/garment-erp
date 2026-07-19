import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button, FormField, Input, useToast } from "@erp/ui";
import { useExportPnd1Mutation, useExportSsoMutation } from "../../../hr/queries.js";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The tax-exports screen (M2 §4.5, design MD5): PND.1 / SSO as async jobs — a job toast appears
 * immediately, resolving to a "started" notification. The contract's export routes are 202-only
 * (no status/result endpoint to poll, unlike `getPayslipPdf`'s 409→302), so the toast can't yet
 * resolve to a download action — that lands once the contract grows a matching poll endpoint.
 */
export function TaxExportsPage() {
  const { t } = useTranslation("hr");
  const { jobToast } = useToast();

  const [period, setPeriod] = React.useState(currentPeriod);
  const exportPnd1 = useExportPnd1Mutation();
  const exportSso = useExportSsoMutation();

  async function runExport(kind: "pnd1" | "sso") {
    const mutation = kind === "pnd1" ? exportPnd1 : exportSso;
    const handle = jobToast({ title: t("taxExports.jobPending", { kind: kind.toUpperCase() }) });
    try {
      await mutation.mutateAsync({ period });
      handle.resolve({
        tone: "success",
        title: t("taxExports.jobStarted", { kind: kind.toUpperCase() }),
        description: t("taxExports.jobStartedBody"),
      });
    } catch {
      handle.resolve({ tone: "danger", title: t("taxExports.jobFailed", { kind: kind.toUpperCase() }) });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("taxExports.title")}</h1>
      <p className="text-sm text-text-secondary">{t("taxExports.description")}</p>

      <div className="flex items-end gap-3">
        <FormField label={t("taxExports.periodLabel")}>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </FormField>
        <Button onClick={() => void runExport("pnd1")} loading={exportPnd1.isPending}>
          {t("taxExports.exportPnd1")}
        </Button>
        <Button variant="secondary" onClick={() => void runExport("sso")} loading={exportSso.isPending}>
          {t("taxExports.exportSso")}
        </Button>
      </div>
    </div>
  );
}
