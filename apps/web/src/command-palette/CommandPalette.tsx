import { Command } from "cmdk";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Icon } from "@erp/ui";
import { useSession } from "../session/session-context";
import { MODULES, ADMIN_ROUTES, HR_ROUTES, INVENTORY_ROUTES, PRODUCTION_ROUTES } from "../nav/registry";
import { filterNav, isModuleVisible } from "../nav/filter";
import { useCommandPalette } from "./command-context";

/**
 * Cmd/Ctrl-K palette. Entries are built from the same nav registry and filtered by the same rules as
 * the sidebar, so an unpermitted module is offered nowhere. It renders through cmdk's Radix dialog
 * (portaled to body), inheriting theme/density from `<html>`; Esc/focus-trap are the dialog's.
 *
 * Admin & Access sub-routes (Users/Roles/Audit/Import) aren't top-level modules — there's no
 * sidebar entry for them yet — so the palette is their only route in until M1's screens (§4) link
 * them; offered to Super Admins only, the same gate their routes enforce.
 *
 * HR & Payroll sub-routes (Employees/OT/Cash advances/Attendance/Payroll/Tax exports), Inventory &
 * Costing sub-routes (Items/Receipts/Issues/Counts/Adjustments/Barcodes/Reports), and Production
 * Tracking sub-routes (Timeline/Work orders/Scan station/WIP board/Subcontracts) follow the same
 * "palette until the screen links them" pattern, but each is gated by its own module-namespace
 * permission(s) rather than a blanket Super-Admin requirement (M2 §1 / M3 §1 / M4 §1).
 */
export function CommandPalette() {
  const { t } = useTranslation(["shell", "iam", "hr", "inventory", "production"]);
  const { open, setOpen } = useCommandPalette();
  const navigate = useNavigate();
  const { hasPermission, isSuperAdmin } = useSession();
  const modules = filterNav(MODULES, { has: hasPermission, isSuperAdmin });
  const adminRoutes = isSuperAdmin ? ADMIN_ROUTES : [];
  const hrRoutes = HR_ROUTES.filter((entry) =>
    isModuleVisible(entry, { has: hasPermission, isSuperAdmin }),
  );
  const inventoryRoutes = INVENTORY_ROUTES.filter((entry) =>
    isModuleVisible(entry, { has: hasPermission, isSuperAdmin }),
  );
  const productionRoutes = PRODUCTION_ROUTES.filter((entry) =>
    isModuleVisible(entry, { has: hasPermission, isSuperAdmin }),
  );

  const go = (path: string) => {
    setOpen(false);
    void navigate({ to: path });
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label={t("topbar.search")}
      overlayClassName="bg-text-primary/40"
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-bg-surface shadow-lg"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-3.5">
        <Icon icon={Search} className="shrink-0 text-text-muted" />
        <Command.Input
          placeholder={t("palette.placeholder")}
          className="w-full bg-transparent py-3 text-body text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-text-muted">
          {t("palette.empty")}
        </Command.Empty>
        <Command.Group heading={t("palette.groupNavigate")}>
          {modules.map((module) => (
            <Command.Item
              key={module.key}
              value={t(module.titleKey)}
              onSelect={() => go(module.path)}
              className="flex cursor-pointer items-center gap-3 rounded-md px-3 text-body text-text-primary outline-none data-[selected=true]:bg-accent-subtle"
              style={{ minHeight: "var(--density-tap-min)" }}
            >
              <Icon icon={module.icon} />
              <span>{t(module.titleKey)}</span>
            </Command.Item>
          ))}
        </Command.Group>
        {adminRoutes.length > 0 ? (
          <Command.Group heading={t("nav.admin")}>
            {adminRoutes.map((entry) => (
              <Command.Item
                key={entry.key}
                value={t(entry.titleKey)}
                onSelect={() => go(entry.path)}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 text-body text-text-primary outline-none data-[selected=true]:bg-accent-subtle"
                style={{ minHeight: "var(--density-tap-min)" }}
              >
                <Icon icon={entry.icon} />
                <span>{t(entry.titleKey)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
        {hrRoutes.length > 0 ? (
          <Command.Group heading={t("nav.hr")}>
            {hrRoutes.map((entry) => (
              <Command.Item
                key={entry.key}
                value={t(entry.titleKey)}
                onSelect={() => go(entry.path)}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 text-body text-text-primary outline-none data-[selected=true]:bg-accent-subtle"
                style={{ minHeight: "var(--density-tap-min)" }}
              >
                <Icon icon={entry.icon} />
                <span>{t(entry.titleKey)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
        {inventoryRoutes.length > 0 ? (
          <Command.Group heading={t("nav.inventory")}>
            {inventoryRoutes.map((entry) => (
              <Command.Item
                key={entry.key}
                value={t(entry.titleKey)}
                onSelect={() => go(entry.path)}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 text-body text-text-primary outline-none data-[selected=true]:bg-accent-subtle"
                style={{ minHeight: "var(--density-tap-min)" }}
              >
                <Icon icon={entry.icon} />
                <span>{t(entry.titleKey)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
        {productionRoutes.length > 0 ? (
          <Command.Group heading={t("nav.production")}>
            {productionRoutes.map((entry) => (
              <Command.Item
                key={entry.key}
                value={t(entry.titleKey)}
                onSelect={() => go(entry.path)}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 text-body text-text-primary outline-none data-[selected=true]:bg-accent-subtle"
                style={{ minHeight: "var(--density-tap-min)" }}
              >
                <Icon icon={entry.icon} />
                <span>{t(entry.titleKey)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
    </Command.Dialog>
  );
}
