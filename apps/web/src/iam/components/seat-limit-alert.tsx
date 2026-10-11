import { useTranslation } from "react-i18next";
import { parseSeatLimitError } from "../seat-limit.js";

/**
 * Renders the seat-cap 422 (M8 §7.2) with its counts and the users who would have taken a seat, so
 * an admin sees *why* a create / role edit / reactivation was refused. Renders nothing for any
 * other error — place it beside the mutation's own generic error handling.
 */
export function SeatLimitAlert({ error }: { error: unknown }) {
  const { t } = useTranslation("iam");
  const info = parseSeatLimitError(error);
  if (!info) return null;

  return (
    <div
      role="alert"
      className="rounded-md border border-danger bg-danger-subtle p-3 text-sm text-danger-on"
    >
      <p className="font-semibold">{t("seats.limitTitle")}</p>
      <p className="mt-1">
        {info.cap !== null && info.counted !== null
          ? t("seats.limitBody", { counted: info.counted, cap: info.cap })
          : t("seats.limitBodyNoCounts")}
      </p>
      {info.exempt !== null && <p className="mt-1">{t("seats.exemptNote", { exempt: info.exempt })}</p>}
      {info.users.length > 0 && (
        <p className="mt-1">
          {t("seats.wouldOccupy")} <span className="font-mono">{info.users.join(", ")}</span>
        </p>
      )}
      <p className="mt-1">{t("seats.upgradeHint")}</p>
    </div>
  );
}
