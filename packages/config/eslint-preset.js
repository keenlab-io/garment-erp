// @ts-check
import tseslint from "typescript-eslint";

/**
 * Shared ESLint flat-config building blocks for the @erp monorepo.
 *
 * Dependency boundaries (spec §6) are enforced here with the built-in
 * `no-restricted-imports` rule, keyed on the `@erp/*` package names — this
 * works regardless of where a package lives on disk, unlike path-based plugins.
 */

/** Base TypeScript config every package extends. */
export const base = tseslint.config(
  {
    ignores: ["dist/**", "build/**", ".next/**", "coverage/**", "node_modules/**"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);

/**
 * Build a boundary rule that bans importing the given package names.
 * @param {string[]} forbidden package names that must not be imported
 * @param {string} message explanation shown on violation
 */
function banImports(forbidden, message) {
  return {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: forbidden.map((name) => ({
            group: [name, `${name}/*`],
            message,
          })),
        },
      ],
    },
  };
}

/** apps/web must never import apps/api — talk through @erp/contracts only. */
export const webBoundaries = banImports(
  ["@erp/api"],
  "apps/web must not import apps/api — communicate via @erp/contracts only (spec §6).",
);

/** apps/api must never import apps/web. */
export const apiBoundaries = banImports(
  ["@erp/web"],
  "apps/api must not import apps/web — communicate via @erp/contracts only (spec §6).",
);

/** @erp/contracts must stay framework-agnostic: no React, no NestJS. */
export const contractsBoundaries = banImports(
  ["react", "react-dom", "@nestjs/common", "@nestjs/core", "@nestjs"],
  "@erp/contracts must be framework-agnostic — only zod / ts-rest / @erp/utils allowed (spec §6.2).",
);

export default base;
