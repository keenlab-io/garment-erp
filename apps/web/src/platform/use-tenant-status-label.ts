import * as React from "react";
import { useTranslation } from "react-i18next";
import { TenantStatus } from "@erp/contracts";

/** Localised label for a tenant lifecycle status. */
export function useTenantStatusLabel(): (status: TenantStatus) => string {
  const { t } = useTranslation("platform");
  return React.useCallback(
    (status: TenantStatus) => {
      switch (status) {
        case TenantStatus.ACTIVE:
          return t("tenants.statusActive");
        case TenantStatus.READ_ONLY:
          return t("tenants.statusReadOnly");
        case TenantStatus.SUSPENDED:
          return t("tenants.statusSuspended");
        case TenantStatus.PURGING:
          return t("tenants.statusPurging");
      }
    },
    [t],
  );
}
