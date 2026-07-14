import { useTranslation } from "react-i18next";
import { Rows2, Rows3 } from "lucide-react";
import { Button, Icon, Tooltip } from "@erp/ui";
import { useDensity } from "../density/density-context";

/**
 * Flip Comfortable ↔ Compact. Hidden in Touch, where density is auto-applied (kiosk routes /
 * coarse pointers) and not a manual choice.
 */
export function DensityToggle() {
  const { t } = useTranslation();
  const { density, setPref } = useDensity();

  if (density === "touch") return null;

  const goingCompact = density === "comfortable";
  const label = goingCompact ? t("topbar.densityCompact") : t("topbar.densityComfortable");

  return (
    <Tooltip content={label}>
      <Button
        variant="icon"
        aria-label={`${t("a11y.densityToggle")}: ${label}`}
        onClick={() => setPref(goingCompact ? "compact" : "comfortable")}
      >
        <Icon icon={goingCompact ? Rows3 : Rows2} />
      </Button>
    </Tooltip>
  );
}
