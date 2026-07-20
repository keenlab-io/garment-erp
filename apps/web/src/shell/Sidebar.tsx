import { useTranslation } from "react-i18next";
import { useSession } from "../session/session-context";
import { MODULES } from "../nav/registry";
import { filterNav } from "../nav/filter";
import { ModuleNav } from "./ModuleNav";
import { BrandMark } from "./BrandMark";

/**
 * The primary navigation rail — ink-900 chrome in both themes via a permanent nested
 * `data-theme="dark"` scope (so its semantic colors resolve light-on-dark with zero theme logic).
 * Items the user can't access are absent, not disabled; Admin & Access is bottom-anchored. Hidden
 * below the md breakpoint, where the bottom tab bar + drawer take over.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const { hasPermission, isSuperAdmin } = useSession();
  const visible = filterNav(MODULES, { has: hasPermission, isSuperAdmin });
  const primary = visible.filter((m) => m.section === "primary");
  const admin = visible.filter((m) => m.section === "admin");

  return (
    <aside
      data-theme="dark"
      className="hidden w-60 shrink-0 flex-col border-r border-border bg-bg-app md:flex"
    >
      <div className="flex h-14 shrink-0 items-center px-4">
        <BrandMark />
      </div>
      <nav aria-label={t("a11y.primaryNav")} className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {primary.map((module) => (
          <ModuleNav key={module.key} module={module} />
        ))}
      </nav>
      {admin.length > 0 ? (
        <nav aria-label={t("a11y.adminNav")} className="flex flex-col gap-0.5 border-t border-border p-3">
          {admin.map((module) => (
            <ModuleNav key={module.key} module={module} />
          ))}
        </nav>
      ) : null}
    </aside>
  );
}
