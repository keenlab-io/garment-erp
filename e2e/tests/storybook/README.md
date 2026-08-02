# Storybook component specs

Playwright specs that drive isolated `@erp/ui` components in Storybook (:6006), codifying
[`docs/testing/test-cases/99-components.md`](../../../docs/testing/test-cases/99-components.md).

Add `*.spec.ts` files here — they run under the `storybook` project (baseURL `E2E_STORYBOOK_URL`,
default `http://localhost:6006`, no auth). Navigate directly to a story's iframe, e.g.:

```ts
await page.goto("/iframe.html?id=organisms-datatable--pagination&viewMode=story");
```

Story ids come from each component's `.stories.tsx` title (kebab-cased) — the 99-components catalog
lists the confirmed ids per case (e.g. `organisms-datatable--with-selection`,
`primitives-inkchip--all-statuses`, `permission-guardedactiondialog--role-delete`).

Prerequisite: `pnpm --filter @erp/ui storybook` running. Start with the DataTable behaviors
(sort / cursor pagination / bulk-select / column presets / keyboard nav) — the highest-value organism.
