import { initContract } from "@ts-rest/core";
import { healthContract } from "./health.js";
import { invoiceContract } from "./invoice.js";
import { iamContract } from "./iam.js";
import { inventoryContract } from "./inventory.js";
import { hrContract } from "./hr.js";
import { productionContract } from "./production.js";

export * from "./_shared.js";
export * from "./health.js";
export * from "./invoice.js";
export * from "./iam.js";
export * from "./inventory.js";
export * from "./hr.js";
export * from "./production.js";

const c = initContract();

/** Root contract — both api and web build from this single object. */
export const contract = c.router({
  health: healthContract,
  invoices: invoiceContract,
  iam: iamContract,
  inventory: inventoryContract,
  hr: hrContract,
  production: productionContract,
});
