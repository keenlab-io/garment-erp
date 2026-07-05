import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Vitest over the NestJS source. `unplugin-swc` compiles TS with SWC, which — unlike
// esbuild — emits the decorator metadata Nest's DI relies on (M0 design §6). Specs live
// next to source (`src/**/*.spec.ts`) and under `test/` (integration). Integration specs
// self-skip unless `DATABASE_URL_TEST` is set, so plain `vitest run` is unit-only.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/main.ts"],
    },
  },
});
