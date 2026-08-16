import { test as setup } from "@playwright/test";
import { login, forceEnglishLightState } from "../fixtures/auth.js";
import {
  PERSONAS,
  SUPERADMIN_CREDENTIALS,
  personaCredentials,
  personaStatePath,
} from "../fixtures/personas.js";

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

/**
 * One saved storage state per limited persona, at `.auth/<key>.json`. A permission-gated spec
 * opts in with `test.use({ storageState: personaStatePath(PERSONAS.hrOfficer) })` — see
 * `docs/testing/UI_TEST_PLAN.md` §4 for who each persona is and what it must NOT see.
 *
 * Every persona is a REAL login against users created by `pnpm db:seed`; if one of these fails with
 * "Invalid credentials", the seed has not been run (or `SEED_PERSONA_PASSWORD` differs). Each is a
 * separate `setup()` so a single broken persona names itself in the report instead of taking the
 * whole suite down with it.
 */
for (const persona of Object.values(PERSONAS)) {
  if (persona.isSuperAdmin) continue; // already covered above, and its path differs

  setup(`authenticate as ${persona.label}`, async ({ page }) => {
    await forceEnglishLightState(page);
    await login(page, personaCredentials(persona));
    await page.context().storageState({ path: personaStatePath(persona) });
  });
}
