import type { shellEn, iamEn } from "./resources/en";

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
