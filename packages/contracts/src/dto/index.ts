import { initContract } from "@ts-rest/core";
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

/** Root contract — both api and web build from this single object. */
export const contract = c.router({
  health: healthContract,
  iam: iamContract,
  inventory: inventoryContract,
  hr: hrContract,
  production: productionContract,
  reporting: reportingContract,
  sales: salesContract,
});
