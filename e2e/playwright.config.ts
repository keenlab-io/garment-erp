import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Garment-ERP UI e2e suite.
 *
 * Two surfaces (see docs/testing/UI_TEST_PLAN.md):
 *   - `app`      → the running web app at :5173 (real backend on :3000, proxied).
 *   - `storybook`→ isolated @erp/ui components at :6006 (component/primitive cases, doc 99).
 *
 * The stack must be up before running (this config does NOT boot Postgres/Redis/MinIO/api):
 *   docker compose -f infra/docker-compose.yml up -d && pnpm db:seed && pnpm dev
 * Optionally launch just the web dev server via the (commented) `webServer` block below.
 */

const APP_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const STORYBOOK_BASE_URL = process.env.E2E_STORYBOOK_URL ?? "http://localhost:6006";

export default defineConfig({
  testDir: "./tests",
  // Deterministic order; parallelism across files is safe (each test logs in via stored state).
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    actionTimeout: 10_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    // 1) Auth setup — logs in once as the seeded super-admin and saves storage state
    //    (localStorage refresh token + English locale + light theme). App tests reuse it.
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { baseURL: APP_BASE_URL } },

    // 2) App tests — full running app, authenticated via the saved super-admin state.
    {
      name: "app",
      testIgnore: /storybook\//,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: APP_BASE_URL,
        storageState: ".auth/superadmin.json",
      },
    },

    // 3) Storybook tests — isolated components at :6006 (no auth). Cases live in tests/storybook/*.
    //    Codify doc 99 (docs/testing/test-cases/99-components.md) here as the suite grows.
    {
      name: "storybook",
      testMatch: /storybook\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: STORYBOOK_BASE_URL },
    },
  ],

  // To let Playwright start the WEB dev server only (api/db/redis must already be up), uncomment:
  // webServer: {
  //   command: "pnpm --filter @erp/web dev",
  //   url: APP_BASE_URL,
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120_000,
  // },
});
