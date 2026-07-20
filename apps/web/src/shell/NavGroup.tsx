import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Icon } from "@erp/ui";
import { useSession } from "../session/session-context";
import { isModuleVisible } from "../nav/filter";
import type { ModuleDescriptor, NavChildDescriptor } from "../nav/types";

/**
 * An expandable sidebar/drawer group — a module whose real screens live at sub-routes. The header
 * button toggles the child list (it never navigates; the children are the destinations). The group
 * auto-opens when the active route is inside the module, and a manual toggle overrides that for the
 * session (design: independent groups, auto-open active, no persistence). Children the user can't
 * access are absent, using the same `isModuleVisible` gate as the rest of the nav — so a group with
 * no reachable children renders nothing. Rendered inside the ink chrome, its semantic colors resolve
 * light-on-dark like the flat `NavItem`s beside it.
 */
export function NavGroup({
  module,
  items,
  onNavigate,
}: {
  module: ModuleDescriptor;
  items: NavChildDescriptor[];
  onNavigate?: () => void;
}) {
  const { t } = useTranslation([
    "shell",
    "iam",
    "hr",
    "inventory",
    "production",
    "sales",
    "reporting",
  ]);
  const { hasPermission, isSuperAdmin } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const visibleItems = items.filter((item) =>
    isModuleVisible(item, { has: hasPermission, isSuperAdmin }),
  );

  // Active when the current path is the module home or inside one of its (visible) children.
  const isActive =
    pathname === module.path ||
    pathname.startsWith(`${module.path}/`) ||
    visibleItems.some((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));

  // Manual toggle wins; otherwise follow the active route.
  const [override, setOverride] = React.useState<boolean | null>(null);
  const open = override ?? isActive;
  const panelId = `nav-group-${module.key}`;

  if (visibleItems.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        data-nav-group={module.key}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOverride(!open)}
        className="flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-body text-text-secondary outline-none transition-colors hover:bg-bg-surface hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus"
        style={{ minHeight: "var(--density-tap-min)" }}
      >
        <Icon icon={module.icon} />
        <span className="flex-1 truncate text-left">{t(module.titleKey)}</span>
        <Icon
          icon={ChevronDown}
          className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open ? (
        <ul id={panelId} className="mt-0.5 flex flex-col gap-0.5 pl-4">
          {visibleItems.map((item) => (
            <li key={item.key}>
              <Link
                to={item.path}
                onClick={onNavigate}
                className="flex items-center gap-3 rounded-md px-3 py-1.5 text-body text-text-secondary outline-none transition-colors hover:bg-bg-surface hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus"
                activeProps={{ className: "bg-bg-surface text-text-primary font-medium" }}
                style={{ minHeight: "var(--density-tap-min)" }}
              >
                <Icon icon={item.icon} />
                <span className="truncate">{t(item.titleKey)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
