import * as React from "react";
import { useTranslation } from "react-i18next";
import type { ReportingKey } from "../i18n/keys.js";
import type { Cadence } from "./components/cron.js";

const WEEKDAY_LABEL_KEY: readonly ReportingKey[] = [
  "reporting:scheduleWeekday.sun",
  "reporting:scheduleWeekday.mon",
  "reporting:scheduleWeekday.tue",
  "reporting:scheduleWeekday.wed",
  "reporting:scheduleWeekday.thu",
  "reporting:scheduleWeekday.fri",
  "reporting:scheduleWeekday.sat",
];

/** Translates a `Cadence`'s day-of-week (0-6) via the `reporting` namespace's `scheduleWeekday`
 * group — shared by the schedule editor's day picker and cadence preview, and the schedules
 * list's row description (M6 §5.1). */
export function useWeekdayLabel(): (dayOfWeek: number) => string {
  const { t } = useTranslation(["reporting"]);
  return React.useCallback((dayOfWeek) => t(WEEKDAY_LABEL_KEY[dayOfWeek] ?? WEEKDAY_LABEL_KEY[0]!), [t]);
}

/**
 * Translates a `Cadence` into its friendly description ("Every Monday 08:00") via the `reporting`
 * namespace — the localized counterpart to `cron.ts`'s English-only `describeCadence` (kept there
 * as the pure default `ScheduleEditor` falls back to, so its existing tests stay locale-agnostic).
 * Shared by the schedule editor's preview line and the schedules list's row description (M6 §5.1).
 */
export function useCadenceLabel(): (cadence: Cadence) => string {
  const { t } = useTranslation(["reporting"]);
  const weekdayLabel = useWeekdayLabel();
  return React.useCallback(
    (cadence) =>
      cadence.frequency === "daily"
        ? t("reporting:scheduleEditor.cadenceDaily", { time: cadence.time })
        : t("reporting:scheduleEditor.cadenceWeekly", { day: weekdayLabel(cadence.dayOfWeek ?? 0), time: cadence.time }),
    [t, weekdayLabel],
  );
}
