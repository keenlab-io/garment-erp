import * as React from "react";
import type { Preview, Decorator } from "@storybook/react-vite";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { THEMES, DENSITIES } from "@erp/design-tokens";
import { commonEn, commonTh, tableEn, tableTh } from "../src/index";
import "../src/fonts";
import "../src/styles.css";

const LOCALES = ["th", "en"] as const;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The workbench never boots apps/web, so it owns a throwaway i18next instance covering
// @erp/ui's own `common`/`table` namespaces — enough for the locale toolbar to actually
// translate component defaults (DataTable, ConfirmDialog, Dialog, Toast), not just flip `lang`.
void i18next.use(initReactI18next).init({
  lng: "th",
  fallbackLng: "th",
  defaultNS: "common",
  ns: ["common", "table"],
  resources: {
    th: { common: commonTh, table: tableTh },
    en: { common: commonEn, table: tableEn },
  },
  interpolation: { escapeValue: false },
});

/**
 * Wraps every story in the theme × density surface and syncs `<html lang>`. Theme and density
 * are pure attribute flips — the token CSS re-resolves `var(--…)`, so no story or component
 * carries theme/density logic. Proves the M0 "dark is a token swap only" contract.
 */
const withMatrix: Decorator = (Story, context) => {
  const { theme, density, locale } = context.globals;
  React.useEffect(() => {
    document.documentElement.lang = locale;
    void i18next.changeLanguage(locale);
  }, [locale]);
  return (
    <div
      data-theme={theme}
      data-density={density}
      lang={locale}
      className="bg-bg-app text-text-primary font-sans p-8 min-h-screen"
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // Enforce the WCAG 2.1 AA baseline — a11y violations surface as errors, not TODOs.
    a11y: { test: "error" },
  },
  initialGlobals: {
    theme: "light",
    density: "comfortable",
    locale: "th",
  },
  globalTypes: {
    theme: {
      description: "Color theme (data-theme)",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: THEMES.map((t) => ({ value: t, title: cap(t) })),
        dynamicTitle: true,
      },
    },
    density: {
      description: "Interaction density (data-density)",
      toolbar: {
        title: "Density",
        icon: "component",
        items: DENSITIES.map((d) => ({ value: d, title: cap(d) })),
        dynamicTitle: true,
      },
    },
    locale: {
      description: "Locale (Thai default)",
      toolbar: {
        title: "Locale",
        icon: "globe",
        items: LOCALES.map((l) => ({ value: l, title: l.toUpperCase() })),
        dynamicTitle: true,
      },
    },
  },
  decorators: [withMatrix],
};

export default preview;
