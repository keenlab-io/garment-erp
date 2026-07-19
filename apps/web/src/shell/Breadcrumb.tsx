import { Link, useMatches } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { Icon } from "@erp/ui";

/**
 * Page location, derived from the matched route's `staticData.title`. Routes are flat today, so the
 * trail is Home › Page (just the title on the dashboard). Reads route metadata generically, so new
 * module routes get a breadcrumb for free.
 */
export function Breadcrumb() {
  const { t } = useTranslation(["shell", "iam", "hr", "inventory"]);
  const matches = useMatches();
  const leaf = [...matches].reverse().find((m) => m.staticData?.title);
  const title = leaf?.staticData?.title;
  const atHome = leaf?.pathname === "/";

  return (
    <nav aria-label={t("a11y.breadcrumb")} className="flex min-w-0 items-center gap-1.5 text-sm">
      {!atHome ? (
        <>
          <Link to="/" className="shrink-0 text-text-muted hover:text-text-primary">
            {t("breadcrumb.home")}
          </Link>
          <Icon icon={ChevronRight} size={14} className="shrink-0 text-text-muted" />
        </>
      ) : null}
      <span className="truncate font-medium text-text-primary">{title ? t(title) : null}</span>
    </nav>
  );
}
