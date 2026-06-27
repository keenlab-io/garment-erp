import { initQueryClient } from "@ts-rest/react-query";
import { contract } from "@erp/contracts";

/**
 * Typed API client built from the SAME contract the api implements.
 * Change a field in @erp/contracts and this client (and its callers) fail to
 * compile — the core value of the monorepo (spec §5).
 */
export const api = initQueryClient(contract, {
  baseUrl: "",
  baseHeaders: {},
});
