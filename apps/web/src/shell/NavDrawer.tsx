import { useTranslation } from "react-i18next";
import { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerTitle } from "@erp/ui";
import { useSession } from "../session/session-context";
import { MODULES } from "../nav/registry";
import { filterNav } from "../nav/filter";
import { NavItem } from "./NavItem";
import { BrandMark } from "./BrandMark";

/**
 * Overflow navigation for small screens — the full role-filtered nav in an ink-chrome drawer (same
 * `data-theme="dark"` treatment as the sidebar). Opened from the top-bar menu button and the mobile
 * tab bar's More action; selecting an item closes it.
 */
export function NavDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { hasPermission, isSuperAdmin } = useSession();
  const visible = filterNav(MODULES, { has: hasPermission, isSuperAdmin });
  const primary = visible.filter((m) => m.section === "primary");
  const admin = visible.filter((m) => m.section === "admin");
  const close = () => onOpenChange(false);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent side="left" data-theme="dark" className="w-72 bg-bg-app">
        <DrawerHeader>
          <DrawerTitle>
            <BrandMark />
          </DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <nav aria-label={t("a11y.primaryNav")} className="flex flex-col gap-0.5">
            {primary.map((module) => (
              <NavItem key={module.key} module={module} onNavigate={close} />
            ))}
          </nav>
          {admin.length > 0 ? (
            <nav
              aria-label={t("a11y.adminNav")}
              className="mt-2 flex flex-col gap-0.5 border-t border-border pt-2"
            >
              {admin.map((module) => (
                <NavItem key={module.key} module={module} onNavigate={close} />
              ))}
            </nav>
          ) : null}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
