import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { Button, Icon } from "@erp/ui";
import { useLocale } from "../i18n/locale-context";

/** TH ↔ EN. The label names the language you'll switch to; the choice persists. */
export function LanguageToggle() {
  const { t } = useTranslation();
  const { toggleLocale } = useLocale();

  return (
    <Button variant="ghost" onClick={toggleLocale}>
      <Icon icon={Languages} />
      <span className="hidden text-sm sm:inline">{t("topbar.language")}</span>
    </Button>
  );
}
