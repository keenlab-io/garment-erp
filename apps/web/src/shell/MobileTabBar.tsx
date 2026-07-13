import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import { Icon } from "@erp/ui";
import { useSession } from "../session/session-context";
import { MODULES } from "../nav/registry";
import { filterNav } from "../nav/filter";
import type { ModuleDescriptor } from "../nav/types";

function TabItem({ module }: { module: ModuleDescriptor }) {
  const { t } = useTranslation();
  return (
    <Link
      to={module.path}
      activeOptions={{ exact: module.path === "/" }}
      className="flex flex-1 flex-col items-center justify-center gap-0.5 px-1 text-caption outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      activeProps={{ className: "text-accent-text" }}
      inactiveProps={{ className: "text-text-muted" }}
      style={{ minHeight: "var(--density-tap-min)" }}
    >
      <Icon icon={module.icon} size={20} />
      <span className="max-w-full truncate">{t(module.titleKey)}</span>
    </Link>
  );
}

/**
 * Bottom tab bar for viewports below the md breakpoint — the first few permitted modules plus a
 * More action that opens the full nav drawer. Same role-filtering as the sidebar. Hidden at md+.
 */
export function MobileTabBar({ onOpenNav }: { onOpenNav: () => void }) {
  const { t } = useTranslation();
  const { hasPermission, isSuperAdmin } = useSession();
  const primary = filterNav(MODULES, { has: hasPermission, isSuperAdmin }).filter(
    (m) => m.section === "primary",
  );

  return (
    <nav
      aria-label={t("a11y.primaryNav")}
      className="flex shrink-0 items-stretch border-t border-border bg-bg-surface py-1 md:hidden"
      style={{ zIndex: "var(--z-sticky)" }}
    >
      {primary.slice(0, 4).map((module) => (
        <TabItem key={module.key} module={module} />
      ))}
      <button
        type="button"
        onClick={onOpenNav}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 text-caption text-text-muted outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        style={{ minHeight: "var(--density-tap-min)" }}
      >
        <Icon icon={Menu} size={20} />
        <span>{t("topbar.more")}</span>
      </button>
    </nav>
  );
}
