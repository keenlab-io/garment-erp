import * as React from "react";
import { useLocale } from "../i18n/locale-context.js";
import { useDateFormat } from "../i18n/use-formatters.js";

/**
 * Formats a document date (quotation/invoice date, valid-until, due date) for the paper preview
 * and the document editor's detail view — Gregorian in both locales, with a "(BE nnnn)"
 * Buddhist-Era suffix appended when the active locale is Thai. `useDateFormat` stays
 * Gregorian-only everywhere else in the app (its own doc comment) — design.md's open question #1
 * resolves BE rendering as opt-in, scoped to this M5 document layer only (M5 §5.1, FD8).
 */
export function useDocumentDateFormat(options?: Intl.DateTimeFormatOptions): (value: Date | string) => string {
  const { locale } = useLocale();
  const dateFormat = useDateFormat({ dateStyle: "medium", ...options });
  return React.useCallback(
    (value) => {
      const date = typeof value === "string" ? new Date(value) : value;
      const formatted = dateFormat.format(date);
      return locale === "th" ? `${formatted} (BE ${date.getFullYear() + 543})` : formatted;
    },
    [dateFormat, locale],
  );
}
