import { initContract, type AppRouter } from "@ts-rest/core";
import { healthContract } from "./health.js";
import { iamContract } from "./iam.js";
import { inventoryContract } from "./inventory.js";
import { hrContract } from "./hr.js";
import { productionContract } from "./production.js";
import { reportingContract } from "./reporting.js";
import { salesContract } from "./sales.js";

export * from "./_shared.js";
export * from "./health.js";
export * from "./iam.js";
export * from "./inventory.js";
export * from "./hr.js";
export * from "./production.js";
export * from "./reporting.js";
export * from "./sales.js";

const c = initContract();

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
  production: typeof productionContract;
  reporting: typeof reportingContract;
  sales: typeof salesContract;
}

/** Root contract — both api and web build from this single object. */
export const contract: RootContract = c.router({
  health: healthContract,
  iam: iamContract,
  inventory: inventoryContract,
  hr: hrContract,
  production: productionContract,
  reporting: reportingContract,
  sales: salesContract,
});
