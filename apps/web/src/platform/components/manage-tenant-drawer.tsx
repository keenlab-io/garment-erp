import * as React from "react";
import { useTranslation } from "react-i18next";
import type { TenantListItem } from "@erp/contracts";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@erp/ui";
import { BillingSection } from "./billing-section.js";
import { FeaturesSection } from "./features-section.js";
import { LifecycleSection } from "./lifecycle-section.js";
import { SupportSection } from "./support-section.js";

/** The per-tenant control surface: lifecycle, feature overrides and support-session start, in one drawer. */
export function ManageTenantDrawer({
  tenant,
  onClose,
}: {
  tenant: TenantListItem | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("platform");
  // The status mutation returns the fresh row; keep it so the drawer reflects the change at once
  // (the list query refetches underneath).
  const [override, setOverride] = React.useState<TenantListItem | null>(null);
  React.useEffect(() => setOverride(null), [tenant?.id]);
  const current = override ?? tenant;

  return (
    <Drawer open={tenant !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent aria-describedby={undefined}>
        {current && (
          <div className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle className="text-h3 font-semibold text-text-primary">
                {t("manage.title", { name: current.name })}
              </DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="flex flex-col gap-4">
              <LifecycleSection tenant={current} onChanged={setOverride} />
              <FeaturesSection tenant={current} />
              <BillingSection tenant={current} />
              <SupportSection tenant={current} />
            </DrawerBody>
            <DrawerFooter>
              <Button variant="ghost" onClick={onClose}>
                {t("manage.close")}
              </Button>
            </DrawerFooter>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
