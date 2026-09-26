import type { AppRoute, AppRouter } from "@ts-rest/core";
import { initContract } from "@ts-rest/core";
import { API_PREFIX, withErrors } from "./_shared.js";
import { healthContract } from "./health.js";
import { iamContract } from "./iam.js";
import { inventoryContract } from "./inventory.js";
import { hrContract } from "./hr.js";
import { platformContract } from "./platform.js";
import { productionContract } from "./production.js";
import { TenantContextResponse } from "./public.js";
import { reportingContract } from "./reporting.js";
import { salesContract } from "./sales.js";

export * from "./_shared.js";
export * from "./health.js";
export * from "./iam.js";
export * from "./inventory.js";
export * from "./hr.js";
export * from "./platform.js";
export * from "./production.js";
export * from "./public.js";
export * from "./reporting.js";
export * from "./sales.js";

const c = initContract();

/**
 * Pre-login, host-resolved tenant branding (M7 §1.4) — a bare route on the root
 * contract (not nested under a module router) since it belongs to no business module.
 */
const publicTenantContext: AppRoute = {
  method: "GET",
  path: `${API_PREFIX}/public/tenant-context`,
  responses: withErrors({ 200: TenantContextResponse }),
  summary: "Pre-login tenant branding, resolved by request hostname",
};

/**
 * Explicit shape for `contract` below — the iam router grew past the size `tsc` will infer and
 * serialize into a declaration file on its own (TS7056), so this gives it an annotation instead.
 * Extends `AppRouter` (rather than a plain object type) so `contract` still satisfies the
 * `TRouter extends AppRouter` generic bound `c.router`/`initQueryClient` check.
 */
interface RootContract extends AppRouter {
  health: typeof healthContract;
  iam: typeof iamContract;
  inventory: typeof inventoryContract;
  hr: typeof hrContract;
  platform: typeof platformContract;
  production: typeof productionContract;
  publicTenantContext: typeof publicTenantContext;
  reporting: typeof reportingContract;
  sales: typeof salesContract;
}

/** Root contract — both api and web build from this single object. */
export const contract: RootContract = c.router({
  health: healthContract,
  iam: iamContract,
  inventory: inventoryContract,
  hr: hrContract,
  platform: platformContract,
  production: productionContract,
  publicTenantContext,
  reporting: reportingContract,
  sales: salesContract,
});
