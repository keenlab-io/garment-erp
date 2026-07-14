import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Icon } from "@erp/ui";
import type { ModuleDescriptor } from "../nav/types";

/**
 * A single sidebar/drawer navigation link. Active styling comes from TanStack Router's
 * active/inactive props; height honors the density tap-target token so the same item works on the
 * shop floor. Rendered inside the ink chrome, its semantic colors resolve to light-on-dark.
 */
export function NavItem({
  module,
  onNavigate,
}: {
  module: ModuleDescriptor;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Link
      to={module.path}
      activeOptions={{ exact: module.path === "/" }}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-md px-3 py-1.5 text-body outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus"
      activeProps={{ className: "bg-bg-surface text-text-primary font-medium" }}
      inactiveProps={{
        className: "text-text-secondary hover:bg-bg-surface hover:text-text-primary",
      }}
      style={{ minHeight: "var(--density-tap-min)" }}
    >
      <Icon icon={module.icon} />
      <span className="truncate">{t(module.titleKey)}</span>
    </Link>
  );
}
