import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { Icon } from "@erp/ui";

/** The prominent deletion notice (PDPA) — shown on the landing page and again on the entry screen. */
export function DemoDeletionNotice() {
  const { t } = useTranslation();
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-md border border-warning bg-warning-subtle p-4 text-left text-warning-on"
    >
      <Icon icon={TriangleAlert} size={20} />
      <div>
        <p className="text-body-strong font-semibold">{t("demo.deletionNoticeTitle")}</p>
        <p className="mt-1 text-sm">{t("demo.deletionNotice")}</p>
      </div>
    </div>
  );
}
