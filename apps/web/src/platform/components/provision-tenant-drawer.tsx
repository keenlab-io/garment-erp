import * as React from "react";
import { useTranslation } from "react-i18next";
import type { ProvisionedTenantAdmin } from "@erp/contracts";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@erp/ui";
import { useCreateTenantMutation, usePlansQuery } from "../queries.js";

/**
 * Tenant provisioning (M8 §7.1, design D1): collects the tenant, its plan and its first super-admin,
 * then shows the one-time temporary password the api returns — it is never retrievable again, so the
 * drawer stays on that result until the operator confirms they've copied it.
 */
export function ProvisionTenantDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("platform");
  const plans = usePlansQuery();
  const create = useCreateTenantMutation();

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [planId, setPlanId] = React.useState("");
  const [adminName, setAdminName] = React.useState("");
  const [adminEmail, setAdminEmail] = React.useState("");
  const [created, setCreated] = React.useState<ProvisionedTenantAdmin | null | undefined>(undefined);

  React.useEffect(() => {
    if (open) {
      setName("");
      setSlug("");
      setDomain("");
      setPlanId("");
      setAdminName("");
      setAdminEmail("");
      setCreated(undefined);
      create.reset();
    }
  }, [open]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    create.mutate(
      {
        body: {
          name,
          slug,
          ...(domain ? { domain } : {}),
          ...(planId ? { plan_id: planId } : {}),
          ...(adminEmail ? { admin_email: adminEmail } : {}),
          ...(adminName ? { admin_name: adminName } : {}),
        },
      },
      { onSuccess: (result) => setCreated(result.body.admin) },
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        {created !== undefined ? (
          <div className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle className="text-h3 font-semibold text-text-primary">{t("provision.createdTitle")}</DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="flex flex-col gap-3">
              {created ? (
                <>
                  <p className="text-sm text-text-secondary">
                    {t("provision.createdBody", { email: created.email })}
                  </p>
                  <FormField label={t("provision.tempPassword")}>
                    <Input readOnly value={created.temp_password} className="font-mono" />
                  </FormField>
                </>
              ) : (
                <p className="text-sm text-text-secondary">{t("provision.createdNoAdmin")}</p>
              )}
            </DrawerBody>
            <DrawerFooter>
              <Button onClick={() => onOpenChange(false)}>{t("provision.done")}</Button>
            </DrawerFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex h-full flex-col">
            <DrawerHeader>
              <DrawerTitle className="text-h3 font-semibold text-text-primary">{t("provision.title")}</DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="flex flex-col gap-4">
              {create.isError && (
                <p role="alert" className="text-sm text-danger">
                  {t("provision.error")}
                </p>
              )}
              <FormField label={t("provision.fieldName")} required>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </FormField>
              <FormField label={t("provision.fieldSlug")} required>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} required className="font-mono" />
              </FormField>
              <FormField label={t("provision.fieldDomain")}>
                <Input value={domain} onChange={(e) => setDomain(e.target.value)} className="font-mono" />
              </FormField>
              <FormField label={t("provision.fieldPlan")}>
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger aria-label={t("provision.fieldPlan")}>
                    <SelectValue placeholder={t("provision.planPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(plans.data?.body ?? []).map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.code} · {plan.included_seats}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label={t("provision.fieldAdminName")}>
                <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} />
              </FormField>
              <FormField label={t("provision.fieldAdminEmail")}>
                <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
              </FormField>
            </DrawerBody>
            <DrawerFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t("provision.cancel")}
              </Button>
              <Button type="submit" loading={create.isPending}>
                {t("provision.submit")}
              </Button>
            </DrawerFooter>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
