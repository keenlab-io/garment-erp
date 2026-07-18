import type { Permission } from "@erp/contracts";

/**
 * Compile-time proof of the spec's "Typo fails the build" scenario: every gate in this module is
 * typed against `Permission` (the exact `@erp/contracts` catalog), never `string`, so a permission
 * code with a typo is a compile error here — not a runtime surprise. `pnpm typecheck` is this test;
 * there is nothing to run. If the catalog ever widens (or this literal is fixed into a real code),
 * the now-unnecessary `@ts-expect-error` directive itself becomes the compile error, so the gate
 * cannot silently rot into `string`.
 */
// @ts-expect-error -- "sales.document.vodi" is a typo, not a member of the Permission union.
export const PERMISSION_TYPO_IS_REJECTED: Permission = "sales.document.vodi";
