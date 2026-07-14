import { useTranslation } from "react-i18next";
import { Bell, Menu } from "lucide-react";
import { Button, Icon } from "@erp/ui";
import { Breadcrumb } from "./Breadcrumb";
import { SearchEntry } from "./SearchEntry";
import { DensityToggle } from "./DensityToggle";
import { LanguageToggle } from "./LanguageToggle";
import { ThemeToggle } from "./ThemeToggle";
import { AvatarMenu } from "./AvatarMenu";

/**
 * The persistent top bar: a nav trigger (mobile only), the page breadcrumb, global search, and the
 * account/preference controls. On a light surface so data and breadcrumbs stay legible against the
 * ink sidebar. Sticky at the `--z-sticky` layer.
 */
export function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const { t } = useTranslation();

  return (
    <header
      className="sticky top-0 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-bg-surface px-3 md:px-4"
      style={{ zIndex: "var(--z-sticky)" }}
    >
      <Button variant="icon" aria-label={t("topbar.openNav")} onClick={onOpenNav} className="md:hidden">
        <Icon icon={Menu} />
      </Button>

      <div className="min-w-0 flex-1">
        <Breadcrumb />
      </div>

      <SearchEntry />
      <Button variant="icon" aria-label={t("topbar.notifications")}>
        <Icon icon={Bell} />
      </Button>
      <DensityToggle />
      <LanguageToggle />
      <ThemeToggle />
      <AvatarMenu />
    </header>
  );
}
