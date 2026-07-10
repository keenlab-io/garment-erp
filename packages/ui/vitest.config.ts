import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Component tests run in jsdom with Testing Library; the react plugin handles JSX/Fast Refresh.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
