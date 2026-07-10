import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import("vite");
    // The react-vite framework already wires @vitejs/plugin-react; add Tailwind so stories
    // resolve the token-backed utilities from src/styles.css.
    return mergeConfig(viteConfig, { plugins: [tailwindcss()] });
  },
};

export default config;
