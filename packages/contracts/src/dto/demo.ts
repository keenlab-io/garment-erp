import { z } from "zod";
import { initContract } from "@ts-rest/core";
import { API_PREFIX, withErrors } from "./_shared.js";

/**
 * M10 — Public Demo Tier: demo landing/entry/end shapes and the Google OIDC routes.
 * The OIDC start/callback respond with browser redirects (no body), so they declare
 * `302` via `c.noBody()` (spread after `withErrors`, which only accepts zod types).
 */

const c = initContract();

/** Landing-page status: is a sandbox available, or is the pool at its cap? */
export const DemoStatus = z.object({
  available: z.boolean(),
  busy: z.boolean(),
});
export type DemoStatus = z.infer<typeof DemoStatus>;

/** Post-callback entry-screen state: deletion notice and PDPA lead opt-in. */
export const DemoEntryState = z.object({
  notice_ack_required: z.boolean(),
  lead_opt_in: z.boolean(),
});
export type DemoEntryState = z.infer<typeof DemoEntryState>;

/** Result of ending the guest's session (logout + purge trigger). */
export const DemoEndResponse = z.object({
  ended: z.boolean(),
});
export type DemoEndResponse = z.infer<typeof DemoEndResponse>;

/**
 * The web route the OIDC callback redirects the browser to on success. The token pair rides in
 * the URL **fragment** (never sent to a server): `access_token`, `refresh_token`, `expires_in`,
 * `return_to`, and `demo=1` when the sign-in landed in a demo sandbox.
 */
export const OIDC_WEB_COMPLETE_PATH = "/auth/oidc/complete";

/** `GET /auth/oidc/google/start` — optional same-origin path to land on after sign-in. */
export const OidcStartQuery = z.object({
  return_to: z.string().optional(),
});
export type OidcStartQuery = z.infer<typeof OidcStartQuery>;

/** `GET /auth/oidc/google/callback` — Google's redirect: either `code`+`state` or an `error`. */
export const OidcCallbackQuery = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});
export type OidcCallbackQuery = z.infer<typeof OidcCallbackQuery>;

export const demoContract = c.router(
  {
    status: {
      method: "GET",
      path: "/demo/status",
      responses: withErrors({ 200: DemoStatus }),
      summary: "Public demo landing status (sandbox availability)",
    },
    end: {
      method: "POST",
      path: "/demo/end",
      body: c.noBody(),
      responses: withErrors({ 200: DemoEndResponse }),
      summary: "End the demo session (logout + trigger sandbox purge)",
    },
    oidcGoogleStart: {
      method: "GET",
      path: "/auth/oidc/google/start",
      query: OidcStartQuery,
      responses: { ...withErrors({}), 302: c.noBody() },
      summary: "Redirect to Google's authorization endpoint",
    },
    oidcGoogleCallback: {
      method: "GET",
      path: "/auth/oidc/google/callback",
      query: OidcCallbackQuery,
      responses: { ...withErrors({}), 302: c.noBody() },
      summary: "Complete the Google OIDC flow and sign the user in",
    },
  },
  { pathPrefix: API_PREFIX },
);
