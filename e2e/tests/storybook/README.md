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

Prerequisite: `pnpm --filter @erp/ui storybook` running (CI starts it in `.github/workflows/e2e.yml`).

**All 26 doc-99 cases are codified** across `data-table.spec.ts`, `primitives.spec.ts` and
`dialogs-and-inputs.spec.ts`.

Two things that will bite you when adding more:

- **Pin the locale.** Storybook's default here is Thai, so `getByRole("button", { name: "Next" })`
  silently misses — the control is "ถัดไป". Every story is loaded with `&globals=locale:en`.
- **Wait on `#storybook-root`, not `body`.** The body is non-empty the moment Storybook paints its
  own error overlay, so asserting on it races the render.
