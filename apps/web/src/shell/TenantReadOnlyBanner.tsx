import * as React from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { Icon, useToast } from "@erp/ui";
import {
  isTenantReadOnly,
  onTenantReadOnlyRejection,
  subscribeTenantReadOnly,
} from "../api/tenant-status.js";

/** Reads the sticky "this tenant is read-only" flag the api client raises (M7 §14.3). */
export function useTenantReadOnly(): boolean {
  return React.useSyncExternalStore(subscribeTenantReadOnly, isTenantReadOnly);
}

/**
 * The persistent read-only notice (M7 §14.3): once a write is refused with 403 `TENANT_READ_ONLY`
 * the banner stays up for the rest of the session — reads keep working, so the user can carry on
 * looking things up — and every further refused write gets its own warning toast rather than the
 * screen's generic error. Renders nothing while the tenant is (as far as we know) writable.
 */
export function TenantReadOnlyBanner() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const readOnly = useTenantReadOnly();

  React.useEffect(
    () =>
      onTenantReadOnlyRejection(() => {
        toast({
          tone: "warning",
          title: t("tenant.readOnlyToastTitle"),
          description: t("tenant.readOnlyToastBody"),
        });
      }),
    [toast, t],
  );

  if (!readOnly) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-warning bg-warning-subtle px-4 py-2 text-sm text-warning-on"
    >
      <Icon icon={Lock} size={16} />
      <span>{t("tenant.readOnlyBanner")}</span>
    </div>
  );
}
