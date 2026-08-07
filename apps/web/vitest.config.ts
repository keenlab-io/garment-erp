import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Shell unit/component tests run in jsdom with Testing Library, mirroring @erp/ui's setup.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Vitest's 5s default is too tight for the screen-level tests. The heaviest ones drive
    // ~20 `userEvent` interactions (each with its own internal delay) through jsdom, and on
    // a 2-core CI runner executing the whole workspace in parallel they land right on the
    // boundary — `document-editor.test.tsx` failed main twice at 5059ms and 5130ms while
    // passing locally and on the lighter affected-only PR run. That is wall-clock pressure,
    // not a hung test: a genuinely stuck test still fails here, just later.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
