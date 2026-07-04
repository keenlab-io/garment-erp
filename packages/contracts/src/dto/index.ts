import { initContract } from "@ts-rest/core";
import { healthContract } from "./health.js";
import { invoiceContract } from "./invoice.js";

export * from "./_shared.js";
export * from "./health.js";
export * from "./invoice.js";

const c = initContract();

/** Root contract — both api and web build from this single object. */
export const contract = c.router({
  health: healthContract,
  invoices: invoiceContract,
});
