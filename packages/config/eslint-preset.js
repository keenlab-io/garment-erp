// @ts-check
import tseslint from "typescript-eslint";

/**
 * Shared ESLint flat-config building blocks for the @erp monorepo.
 *
 * Dependency boundaries (spec §6) are enforced here with the built-in
 * `no-restricted-imports` rule, keyed on the `@erp/*` package names — this
 * works regardless of where a package lives on disk, unlike path-based plugins.
 */

const ANTD_BAN_MESSAGE =
  "Ant Design is banned — @erp/ui is the owned Radix + token component layer; antd cannot reach the locked Ink & Substrate tokens/density (M0 frontend design D1).";

/**
 * The antd restricted-import pattern, shared by `base` and every `banImports` boundary so the
 * ban stays workspace-wide even in packages whose boundary config replaces `no-restricted-imports`.
 */
const ANTD_PATTERN = { group: ["antd", "antd/*"], message: ANTD_BAN_MESSAGE };

/** Base TypeScript config every package extends. */
export const base = tseslint.config(
  {
    ignores: ["dist/**", "build/**", ".next/**", "coverage/**", "node_modules/**", "storybook-static/**"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-imports": ["error", { patterns: [ANTD_PATTERN] }],
    },
  },
);

/**
 * Build a boundary rule that bans importing the given package names. The antd ban is always
 * folded in so a package applying a boundary can't accidentally drop it (a later flat-config
 * entry fully replaces `no-restricted-imports` rather than merging it).
 * @param {string[]} forbidden package names that must not be imported
 * @param {string} message explanation shown on violation
 */
function banImports(forbidden, message) {
  return {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ANTD_PATTERN,
            ...forbidden.map((name) => ({
              group: [name, `${name}/*`],
              message,
            })),
          ],
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

/**
 * @erp/db must not import @erp/contracts (would create a cycle once contracts
 * reference DB-derived types) nor any NestJS package (drizzle-kit, migrate/seed
 * scripts, and integration tests must import the schema without booting Nest).
 * Enums shared with contracts are duplicated as $type unions and kept in sync
 * by a parity test — see M0-foundation plan §3 / design R5.
 */
export const dbBoundaries = banImports(
  ["@erp/contracts", "@nestjs/common", "@nestjs/core", "@nestjs"],
  "@erp/db must be framework-agnostic — no @erp/contracts, no @nestjs/* (spec §6, M0 design D1).",
);

/**
 * @erp/design-tokens must stay a framework-agnostic token source: it emits CSS and a
 * Tailwind preset but depends on no UI framework, no other @erp/* package, and not Tailwind
 * itself at runtime — so the API can consume the token CSS for PDF templates without pulling
 * React (M0 frontend design D2/D9).
 */
export const designTokensBoundaries = banImports(
  [
    "react",
    "react-dom",
    "tailwindcss",
    "@nestjs/common",
    "@nestjs/core",
    "@nestjs",
    "@erp/contracts",
    "@erp/ui",
    "@erp/web",
    "@erp/api",
  ],
  "@erp/design-tokens must be framework-agnostic — token source only, no framework or @erp/* runtime deps (M0 frontend design D2/D9).",
);

/**
 * @erp/ui is the presentational component layer: it may import @erp/design-tokens, @erp/contracts,
 * @erp/utils, Radix and utility libs — but never app code, data-fetching clients, or the router.
 * Keeping data/routing out preserves reusability and the apps-never-import-each-other rule
 * (M0 frontend design D2/D9).
 */
export const uiBoundaries = banImports(
  [
    "@erp/web",
    "@erp/api",
    "@ts-rest/core",
    "@ts-rest/react-query",
    "@ts-rest/nest",
    "@tanstack/react-query",
    "@tanstack/react-router",
  ],
  "@erp/ui must stay presentational — no apps/*, no data-fetching clients (@ts-rest/@tanstack query), no router (M0 frontend design D2/D9).",
);

/**
 * Styling in @erp/ui and apps/web must consume the design system through **semantic** token
 * names only. Raw hex colors and primitive token names (`--ink-*`, `--cyan-*`, `--substrate-*`,
 * `--magenta-*`) bypass the Tailwind preset and break the "dark is a token swap only" contract,
 * so they are banned in string/template literals (className strings, style values) — M0 frontend
 * design D3 and the semantic-only enforcement risk mitigation. esquery matches the literal value
 * against a regex.
 */
export const styleTokenBoundaries = {
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "Literal[value=/#[0-9A-Fa-f]{3,8}\\b/]",
        message:
          "Raw hex colors are banned in @erp/ui/apps/web styles — use a semantic token utility from the @erp/design-tokens preset (M0 frontend design D3).",
      },
      {
        selector: "TemplateElement[value.raw=/#[0-9A-Fa-f]{3,8}\\b/]",
        message:
          "Raw hex colors are banned in @erp/ui/apps/web styles — use a semantic token utility from the @erp/design-tokens preset (M0 frontend design D3).",
      },
      {
        selector: "Literal[value=/--(?:ink|cyan|substrate|magenta)-/]",
        message:
          "Primitive token names (--ink-/--cyan-/--substrate-/--magenta-) are banned in styles — reference a semantic token instead (M0 frontend design D3).",
      },
      {
        selector: "TemplateElement[value.raw=/--(?:ink|cyan|substrate|magenta)-/]",
        message:
          "Primitive token names (--ink-/--cyan-/--substrate-/--magenta-) are banned in styles — reference a semantic token instead (M0 frontend design D3).",
      },
    ],
  },
};

export default base;
