import type { shellEn, iamEn, hrEn, inventoryEn, productionEn, salesEn, reportingEn } from "./resources/en";

/** Flattens a nested message tree into the union of its dot-path leaf keys (e.g. `"nav.dashboard"`). */
export type DotPaths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DotPaths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every valid key in the `shell` namespace — used to type route titles/breadcrumbs and nav titleKeys. */
export type ShellKey = DotPaths<typeof shellEn>;

/**
 * Every valid key in the `iam` namespace, prefixed with i18next's `ns:` separator so a bare
 * `t(key)` call (no explicit `{ ns }` option, as route titles/breadcrumbs use) resolves against
 * the non-default namespace.
 */
export type IamKey = `iam:${DotPaths<typeof iamEn>}`;

/** Every valid key in the `hr` namespace, prefixed `hr:` for the same reason as `IamKey`. */
export type HrKey = `hr:${DotPaths<typeof hrEn>}`;

/** Every valid key in the `inventory` namespace, prefixed `inventory:` for the same reason as `IamKey`. */
export type InventoryKey = `inventory:${DotPaths<typeof inventoryEn>}`;

/** Every valid key in the `production` namespace, prefixed `production:` for the same reason as `IamKey`. */
export type ProductionKey = `production:${DotPaths<typeof productionEn>}`;

/** Every valid key in the `sales` namespace, prefixed `sales:` for the same reason as `IamKey`. */
export type SalesKey = `sales:${DotPaths<typeof salesEn>}`;

/** Every valid key in the `reporting` namespace, prefixed `reporting:` for the same reason as `IamKey`. */
export type ReportingKey = `reporting:${DotPaths<typeof reportingEn>}`;
