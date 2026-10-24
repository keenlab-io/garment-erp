import { expect, test, type Page } from "@playwright/test";
import { forceEnglishLightState } from "../fixtures/auth.js";
import { startStubIdp, type StubIdp } from "../fixtures/stub-idp.js";

/**
 * M10 public demo, end to end (task 7.9): landing → "Continue with Google" (stub IdP) → deletion
 * notice + opt-in screen → the seeded factory (order tracking, delayed step) → end demo → sandbox
 * gone, and signing in again yields a fresh factory.
 *
 * Needs a CLOUD-mode stack whose api was started with the demo pool and the stub IdP wired in:
 *   DEPLOYMENT_MODE=cloud DEMO_HOST=<host the browser uses> GOOGLE_OAUTH_CLIENT_ID=e2e-client
 *   GOOGLE_OAUTH_CLIENT_SECRET=e2e-secret GOOGLE_OIDC_BASE_URL=http://localhost:<E2E_DEMO_IDP_PORT>
 * plus a `tenant_domain` row for DEMO_HOST with `resolution_mode = DEMO_POOL`. The browser must
 * reach the app via that host (E2E_DEMO_BASE_URL). Self-skips unless `E2E_DEMO_BASE_URL` is set —
 * self-hosted CI exposes no demo surface (design §8.4).
 */
const DEMO_BASE_URL = process.env.E2E_DEMO_BASE_URL;
const IDP_PORT = Number(process.env.E2E_DEMO_IDP_PORT ?? 4599);
const CLIENT_ID = process.env.E2E_DEMO_CLIENT_ID ?? "e2e-client";

test.use({ baseURL: DEMO_BASE_URL, storageState: { cookies: [], origins: [] } });

test.describe("M10 public demo flow (TC-DEMO-01)", () => {
  test.skip(!DEMO_BASE_URL, "requires a cloud-mode demo stack + stub IdP (E2E_DEMO_BASE_URL) — see file header");

  let idp: StubIdp;
  test.beforeAll(async () => {
    idp = await startStubIdp({ port: IDP_PORT, clientId: CLIENT_ID });
  });
  test.afterAll(async () => {
    await idp?.close();
  });

  async function enterDemo(page: Page, optIn = false) {
    await forceEnglishLightState(page);
    await page.goto("/demo");
    await expect(page.getByText("Your data will be deleted")).toBeVisible();
    await page.getByRole("link", { name: "Continue with Google" }).click();

    // Back from the (stub) IdP: notice repeated, opt-in unchecked by default.
    await expect(page.getByRole("heading", { name: "Your demo factory is ready" })).toBeVisible();
    await expect(page.getByText("Your data will be deleted")).toBeVisible();
    const consent = page.getByRole("checkbox");
    await expect(consent).not.toBeChecked();
    if (optIn) await consent.check();
    // Tokens never linger in the address bar.
    expect(page.url()).not.toContain("access_token");
    await page.getByRole("button", { name: "Enter the demo" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/demo"));
    await expect(page.getByRole("status").filter({ hasText: "Demo factory" })).toBeVisible();
  }

  async function workOrderNumbers(page: Page): Promise<string[]> {
    await page.goto("/production/work-orders");
    const cells = page.getByRole("gridcell", { name: /^WO\d{8}$/ });
    await expect(cells.first()).toBeVisible();
    return cells.allTextContents();
  }

  test("sign in, explore the seeded factory, end the demo, get a fresh one", async ({ page }) => {
    await enterDemo(page);

    // Order tracking: the seeded work orders are there (the delayed step is asserted in the api suite).
    const first = await workOrderNumbers(page);
    expect(first.length).toBeGreaterThanOrEqual(3);

    // End the demo: data deleted, back on the landing page, session gone.
    await page.getByRole("button", { name: "End demo & delete my data" }).click();
    await page.waitForURL(/\/demo$/);
    await page.goto("/production/work-orders");
    await expect(page).toHaveURL(/\/login|\/demo/);

    // Signing in again is a brand-new guest on a brand-new factory — the old one is not resumed.
    await enterDemo(page);
    const second = await workOrderNumbers(page);
    expect(second.length).toBeGreaterThanOrEqual(3);
    await page.getByRole("button", { name: "End demo & delete my data" }).click();
    await page.waitForURL(/\/demo$/);
  });
});
