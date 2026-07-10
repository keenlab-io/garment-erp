import * as React from "react";
import type { Preview, Decorator } from "@storybook/react-vite";
import { THEMES, DENSITIES } from "@erp/design-tokens";
import "../src/fonts";
import "../src/styles.css";

const LOCALES = ["th", "en"] as const;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Wraps every story in the theme × density surface and syncs `<html lang>`. Theme and density
 * are pure attribute flips — the token CSS re-resolves `var(--…)`, so no story or component
 * carries theme/density logic. Proves the M0 "dark is a token swap only" contract.
 */
const withMatrix: Decorator = (Story, context) => {
  const { theme, density, locale } = context.globals;
  React.useEffect(() => {
    document.documentElement.lang = locale;
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
    a11y: { test: "todo" },
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
