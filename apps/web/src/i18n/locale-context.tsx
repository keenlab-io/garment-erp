import * as React from "react";
import i18n, { type Locale, LOCALE_STORAGE_KEY } from "./i18n";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Flip TH ↔ EN. */
  toggleLocale: () => void;
}

const LocaleContext = React.createContext<LocaleContextValue | null>(null);

/**
 * Owns the active locale: drives i18next, persists the choice, and keeps `<html lang>` in sync so
 * Thai/Latin typesetting and screen readers get the right language. Toggling is live (no reload).
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(() => i18n.language as Locale);

  React.useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = React.useMemo<LocaleContextValue>(() => {
    const setLocale = (next: Locale) => {
      void i18n.changeLanguage(next);
      if (typeof window !== "undefined") window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      setLocaleState(next);
    };
    return {
      locale,
      setLocale,
      toggleLocale: () => setLocale(locale === "th" ? "en" : "th"),
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = React.useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a <LocaleProvider>");
  return ctx;
}
