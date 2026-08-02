import { test as setup } from "@playwright/test";
import { login, forceEnglishLightState } from "../fixtures/auth.js";
import { SUPERADMIN_CREDENTIALS } from "../fixtures/personas.js";

const SUPERADMIN_STATE = ".auth/superadmin.json";

/**
 * Logs in once as the seeded super-admin and saves the resulting storage state (persisted refresh
 * token + English locale + light theme). The `app` project reuses this via `storageState`, so each
 * test starts authenticated — `restoreSession()` silently refreshes the access token on first load.
 */
setup("authenticate as super-admin", async ({ page }) => {
  await forceEnglishLightState(page);
  await login(page, SUPERADMIN_CREDENTIALS);
  await page.context().storageState({ path: SUPERADMIN_STATE });
});
