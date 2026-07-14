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
  },
});
