import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Icon } from "@erp/ui";
import { useCommandPalette } from "../command-palette/command-context";

/**
 * The top-bar global-search affordance. It opens the command palette (where the real search lives),
 * matching the ⌘K / `/` shortcuts. Collapses to an icon on narrow screens.
 */
export function SearchEntry() {
  const { t } = useTranslation();
  const { setOpen } = useCommandPalette();

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={t("topbar.search")}
      className="flex items-center gap-2 rounded-md border border-border bg-bg-app px-2.5 text-sm text-text-muted transition-colors hover:border-border-strong sm:px-3"
      style={{ height: "var(--density-control-h)" }}
    >
      <Icon icon={Search} size={16} />
      <span className="hidden lg:inline">{t("topbar.searchPlaceholder")}</span>
      <kbd className="ml-4 hidden rounded-sm border border-border px-1.5 font-mono text-caption lg:inline">
        ⌘K
      </kbd>
    </button>
  );
}
