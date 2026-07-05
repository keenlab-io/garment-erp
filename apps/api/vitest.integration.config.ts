import swc from "unplugin-swc";
import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "./vitest.config.js";

// Integration run: same harness as the base config, plus a Testcontainers `globalSetup`
// that boots Postgres, applies migrations, and exports `DATABASE_URL_TEST` so the gated
// integration specs actually execute. Invoked via `pnpm --filter @erp/api test:integration`.
export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [swc.vite({ module: { type: "es6" } })],
    test: {
      globalSetup: ["./test/integration/global-setup.ts"],
    },
  }),
);
