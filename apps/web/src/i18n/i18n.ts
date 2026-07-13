import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { shellEn } from "./resources/en";
import { shellTh } from "./resources/th";

/** Supported locales — Thai is the default and fallback (Thai-first product). */
export const LOCALES = ["th", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** localStorage key holding the user's language choice. */
export const LOCALE_STORAGE_KEY = "erp.locale";

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "th";
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === "en" || stored === "th" ? stored : "th";
}

// One shared instance. Group 7 augments this (module namespaces, typed keys, completeness check);
// Task 4 stands up the `shell` namespace and the runtime toggle only.
void i18next.use(initReactI18next).init({
  lng: readStoredLocale(),
  fallbackLng: "th",
  defaultNS: "shell",
  ns: ["shell"],
  resources: {
    en: { shell: shellEn },
    th: { shell: shellTh },
  },
  interpolation: { escapeValue: false },
});

export default i18next;
