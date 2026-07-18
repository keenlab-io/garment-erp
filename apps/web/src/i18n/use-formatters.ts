import * as React from "react";
import { format, groupDigits, type DecimalInput } from "@erp/utils";
import { useLocale } from "./locale-context";
import type { Locale } from "./i18n";

const INTL_LOCALE: Record<Locale, string> = { th: "th-TH", en: "en-US" };

/**
 * Gregorian, Arabic-digit `Intl.DateTimeFormat` bound to the active locale (M0 §7.5). Thai's ICU
 * default calendar is the Buddhist Era (พ.ศ.) — the app UI stays Gregorian/CE per design.md's open
 * question #1 (only the M5 document layer may opt into BE), so `calendar: "gregory"` is forced.
 */
export function useDateFormat(options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const { locale } = useLocale();
  return React.useMemo(
    () =>
      new Intl.DateTimeFormat(INTL_LOCALE[locale], {
        calendar: "gregory",
        numberingSystem: "latn",
        ...options,
      }),
    [locale, options],
  );
}

/** Arabic-digit `Intl.NumberFormat` bound to the active locale — for plain numbers (counts, percentages). */
export function useNumberFormat(options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const { locale } = useLocale();
  return React.useMemo(
    () => new Intl.NumberFormat(INTL_LOCALE[locale], { numberingSystem: "latn", ...options }),
    [locale, options],
  );
}

/**
 * Formats a money string as THB (default 2 display decimals, matching `MoneyCell`). Grouping is
 * comma/period in both locales — Thai and English share the same convention — so, per the i18n
 * spec, locale only ever affects presentation, never the arithmetic: this rounds via decimal.js
 * (`@erp/utils`'s `format`) and groups digits as a string, never converting through a float.
 */
export function useMoneyFormat(): (value: DecimalInput, currency?: string, scale?: number) => string {
  return React.useCallback(
    (value, currency = "฿", scale = 2) => `${currency}${groupDigits(format(value, scale))}`,
    [],
  );
}

/** Formats a quantity string (default 2 display decimals, matching `QtyCell`), optionally unit-suffixed. */
export function useQtyFormat(): (value: DecimalInput, unit?: string, scale?: number) => string {
  return React.useCallback(
    (value, unit, scale = 2) => `${groupDigits(format(value, scale))}${unit ? ` ${unit}` : ""}`,
    [],
  );
}
