import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { Button, Icon } from "@erp/ui";
import { useTheme } from "../theme/theme-context";

/** Flip light/dark. The choice persists and overrides the OS preference. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const goingDark = theme === "light";

  return (
    <Button
      variant="icon"
      aria-label={goingDark ? t("topbar.themeToDark") : t("topbar.themeToLight")}
      onClick={toggleTheme}
    >
      <Icon icon={goingDark ? Moon : Sun} />
    </Button>
  );
}
