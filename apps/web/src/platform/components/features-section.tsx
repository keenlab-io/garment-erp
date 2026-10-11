import * as React from "react";
import { useTranslation } from "react-i18next";
import type { TenantListItem } from "@erp/contracts";
import { Button, FormField, Input, Skeleton, Switch } from "@erp/ui";
import {
  useDeleteTenantFeatureMutation,
  useSetTenantFeatureMutation,
  useTenantFeaturesQuery,
} from "../queries.js";

/** Per-tenant `tenant_feature` overrides (M8 §7.1, design D2): list, set/flip, and remove back to the plan default. */
export function FeaturesSection({ tenant }: { tenant: TenantListItem }) {
  const { t } = useTranslation("platform");
  const features = useTenantFeaturesQuery(tenant.id);
  const setFeature = useSetTenantFeatureMutation();
  const deleteFeature = useDeleteTenantFeatureMutation();

  const [key, setKey] = React.useState("");
  const [enabled, setEnabled] = React.useState(true);

  const overrides = features.data?.body ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
      <h2 className="text-body-strong text-text-primary">{t("features.heading")}</h2>
      <p className="text-sm text-text-secondary">{t("features.hint")}</p>

      {features.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : features.isError ? (
        <p role="alert" className="text-sm text-danger">
          {t("features.loadError")}
        </p>
      ) : overrides.length === 0 ? (
        <p className="text-sm text-text-muted">{t("features.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {overrides.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3">
              <span className="font-mono text-sm text-text-primary">{row.key}</span>
              <span className="flex items-center gap-3">
                <Switch
                  aria-label={`${row.key}: ${t("features.enabled")}`}
                  checked={row.enabled}
                  onCheckedChange={(next) =>
                    setFeature.mutate({ params: { id: tenant.id, key: row.key }, body: { enabled: next } })
                  }
                />
                <Button
                  variant="ghost"
                  onClick={() => deleteFeature.mutate({ params: { id: tenant.id, key: row.key } })}
                >
                  {t("features.remove")}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {(setFeature.isError || deleteFeature.isError) && (
        <p role="alert" className="text-sm text-danger">
          {t("features.error")}
        </p>
      )}

      <form
        className="flex items-end gap-3 border-t border-border pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          setFeature.mutate(
            { params: { id: tenant.id, key: key.trim() }, body: { enabled } },
            { onSuccess: () => setKey("") },
          );
        }}
      >
        <FormField label={t("features.keyLabel")} className="flex-1">
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t("features.keyPlaceholder")}
            className="font-mono"
          />
        </FormField>
        <label className="flex items-center gap-2 pb-2 text-sm text-text-secondary">
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={t("features.enabled")} />
          {t("features.enabled")}
        </label>
        <Button type="submit" loading={setFeature.isPending} disabled={!key.trim()}>
          {t("features.add")}
        </Button>
      </form>
    </section>
  );
}
