import * as React from "react";
import type { Preview, Decorator } from "@storybook/react-vite";
import { THEMES, DENSITIES } from "@erp/design-tokens";
import "@erp/ui/fonts";
import "../src/styles.css";
import i18next, { LOCALES } from "../src/i18n/i18n";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Wraps every story in the theme × density surface and syncs `<html lang>` + the app's own
 * i18next instance (real `shell`/`common`/`table`/`iam` copy, not a throwaway one — apps/web
 * screens' `labels` props are wired from these same resources). Theme/density are pure attribute
 * flips, proving the M0 "dark is a token swap only" contract for module-level components too.
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
