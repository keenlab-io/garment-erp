import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { commonEn, commonTh, tableEn, tableTh } from "@erp/ui";
import { shellEn, iamEn, hrEn, inventoryEn, productionEn, salesEn, reportingEn } from "./resources/en";
import { shellTh, iamTh, hrTh, inventoryTh, productionTh, salesTh, reportingTh } from "./resources/th";

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

// The one i18next instance for the app. `common`/`table` are @erp/ui's own default copy
// (imported, not re-transcribed, so the package and the app share a single translation) — @erp/ui
// never initializes i18next itself, it only consumes this app-provided instance (M0 design D6/D9).
void i18next.use(initReactI18next).init({
  lng: readStoredLocale(),
  fallbackLng: "th",
  defaultNS: "shell",
  ns: ["shell", "common", "table", "iam", "hr", "inventory", "production", "sales", "reporting"],
  resources: {
    en: {
      shell: shellEn,
      common: commonEn,
      table: tableEn,
      iam: iamEn,
      hr: hrEn,
      inventory: inventoryEn,
      production: productionEn,
      sales: salesEn,
      reporting: reportingEn,
    },
    th: {
      shell: shellTh,
      common: commonTh,
      table: tableTh,
      iam: iamTh,
      hr: hrTh,
      inventory: inventoryTh,
      production: productionTh,
      sales: salesTh,
      reporting: reportingTh,
    },
  },
  interpolation: { escapeValue: false },
});

export default i18next;
