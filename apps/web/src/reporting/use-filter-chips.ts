import * as React from "react";
import { useTranslation } from "react-i18next";
import type { ActiveFilterChip } from "./components/active-filter-chip-rail.js";

const DIMENSION_LABEL_KEY: Partial<Record<string, "filters.dimensionDay" | "filters.dimensionMonth">> = {
  day: "filters.dimensionDay",
  month: "filters.dimensionMonth",
};

/** Mirrors `i18n/use-formatters.ts`'s `INTL_LOCALE` map — kept local (rather than depending on
 * `useLocale`/`useDateFormat`, which require a `<LocaleProvider>` ancestor) so this hook works
 * from `i18next`'s own active language alone, same as every other reporting screen hook. */
const INTL_LOCALE: Record<string, string> = { th: "th-TH", en: "en-US" };

/**
 * Formats a dashboard/report cross-filter's `day`/`month` dimension value (`YYYY-MM-DD` /
 * `YYYY-MM`) as a locale period label, appending a "(BE nnnn)" Buddhist-Era suffix in Thai —
 * mirroring the M5 document layer's BE opt-in (`sales/use-document-date-format.ts`), scoped here
 * to the M6 cross-filter period (M6 §5.1, FD8). Any other dimension (a report-specific filter key,
 * not a calendar period — `report-window.ts` only resolves `day`/`month` server-side) passes its
 * raw value through unformatted.
 */
export function usePeriodDimensionValue(): (dimension: string, value: string) => string {
  const { i18n } = useTranslation(["reporting"]);
  const locale = i18n.language;
  const intlLocale = INTL_LOCALE[locale] ?? INTL_LOCALE.th;

  return React.useCallback(
    (dimension, value) => {
      if (dimension === "month") {
        const [year, month] = value.split("-").map(Number);
        if (year && month) {
          const monthFormat = new Intl.DateTimeFormat(intlLocale, {
            calendar: "gregory",
            numberingSystem: "latn",
            year: "numeric",
            month: "long",
          });
          const formatted = monthFormat.format(new Date(year, month - 1, 1));
          return locale === "th" ? `${formatted} (BE ${year + 543})` : formatted;
        }
      }
      if (dimension === "day") {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
          const dayFormat = new Intl.DateTimeFormat(intlLocale, {
            calendar: "gregory",
            numberingSystem: "latn",
            year: "numeric",
            month: "short",
            day: "numeric",
          });
          const formatted = dayFormat.format(date);
          return locale === "th" ? `${formatted} (BE ${date.getFullYear() + 543})` : formatted;
        }
      }
      return value;
    },
    [intlLocale, locale],
  );
}

/**
 * Builds the active-filter chip rail's single cross-filter chip (design MD1) from a dashboard's or
 * the report viewer's `(dimension, value)` search params — shared by the overview, domain
 * dashboard, and report viewer screens (M6 §4) so the dimension label and BE/CE period value
 * formatting (M6 §5.1) aren't each re-implemented.
 */
export function useFilterChips(dimension: string | undefined, value: string | undefined): ActiveFilterChip[] {
  const { t } = useTranslation(["reporting"]);
  const periodValue = usePeriodDimensionValue();
  if (!dimension || !value) return [];
  const dimensionKey = DIMENSION_LABEL_KEY[dimension];
  const dimensionLabel = dimensionKey ? t(dimensionKey) : dimension;
  return [
    {
      key: dimension,
      label: t("filters.chipLabel", { dimension: dimensionLabel, value: periodValue(dimension, value) }),
    },
  ];
}
