import { useMatches } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Icon } from "@erp/ui";
import { MODULES } from "../../nav/registry";

/**
 * Generic module page for M1–M6 modules not yet built. Reads its own route metadata (title + nav
 * key) so one component serves every module route, showing the module glyph and a "coming soon"
 * message inside the shell.
 */
export function ModulePlaceholder() {
  const { t } = useTranslation(["shell", "iam", "hr", "inventory", "production", "sales", "reporting"]);
  const matches = useMatches();
  const leaf = matches.at(-1);
  const module = MODULES.find((m) => m.key === leaf?.staticData?.navKey);
  const title = leaf?.staticData?.title;

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 text-center">
      {module ? (
        <span className="flex size-14 items-center justify-center rounded-lg bg-bg-sunken text-text-muted">
          <Icon icon={module.icon} size={28} />
        </span>
      ) : null}
      <h1 className="font-display text-h2 font-semibold text-text-primary">
        {title ? t(title) : null}
      </h1>
      <p className="text-body text-text-secondary">{t("page.comingSoonBody")}</p>
    </div>
  );
}
