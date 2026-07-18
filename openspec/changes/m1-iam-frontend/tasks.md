# M1 — Access & Identity (Frontend): Tasks

> Applies after `m0-frontend-foundation` + backend `m1-iam` contract. UI-only; consumes the
> `iam` contract via `@ts-rest/react-query`. No `apps/web` ↔ `apps/api` import.

## 1. Deps, routes & i18n

- [x] 1.1 Register `iam` routes in the TanStack Router tree with metadata (title/breadcrumb,
  required `Permission`, super-admin nav group): `/login`, `/admin/users`, `/admin/users/{id}`,
  `/admin/roles`, `/admin/roles/{id}`, `/admin/audit`, `/admin/import`
- [x] 1.2 Add the `iam` i18next namespace (TH default + EN); wire nav + ⌘K entries from route metadata

## 2. Auth data layer

- [ ] 2.1 Login mutation + token store; inject the token into the `@ts-rest/react-query` client
  `baseHeaders`; session context provides `AuthUser` for M0's `PermissionsProvider`
- [ ] 2.2 401 / stale `permissions_version` interceptor → clear session → route to `/login` with notice
- [ ] 2.3 `iam` query hooks (users, roles, role-templates, audit, sessions) + mutation invalidation

## 3. Module components

- [ ] 3.1 **PermissionMatrix** — module×action grid from the `PERMISSIONS` catalog; collapsible
  groups; special `hr.salary.*` / `inventory.cost.*` toggles captioned below; live "affects N"
- [ ] 3.2 **BeforeAfterDiff** viewer (two-column, changed fields highlighted)
- [ ] 3.3 **ImportValidationTable** (per-row OK/error) + upload dropzone
- [ ] 3.4 **SessionList** row with revoke action

## 4. Screens / flows

- [ ] 4.1 `authentication-ui` — `/login` screen + token lifecycle + re-auth flow (MD1)
- [ ] 4.2 `users-admin` — users list (DataTable), user detail (roles/sessions/activity),
  create/edit drawer, force-logout (guarded ConfirmDialog + re-auth), session revoke
- [ ] 4.3 `role-editor` — roles list, matrix editor (MD2: live affects-N, save confirm, last-perm
  block), clone flow, guarded delete (MD3: 409 reassign inline), role templates
- [ ] 4.4 `audit-log-viewer` — filterable immutable table + diff expansion (MD4)
- [ ] 4.5 `permission-import` — upload + validation review + partial import (MD5)

## 5. i18n, a11y & Storybook

- [ ] 5.1 TH+EN strings for the `iam` namespace; matrix/diff/import labels
- [ ] 5.2 WCAG AA: matrix keyboard nav, focus rings, aria on icon buttons, audit-action chips not color-only
- [ ] 5.3 Stories: PermissionMatrix, BeforeAfterDiff, ImportValidationTable at theme×density×locale

## 6. Verification

- [ ] 6.1 `pnpm --filter @erp/web build && typecheck && lint` green; Storybook renders
- [ ] 6.2 Routes mount only for permitted users (nav absent otherwise); login → session → gated nav works
- [ ] 6.3 Drive: edit role (affects-N shown before save) → save (re-auth notice) → delete bound role
  (blocked, reassign link) → audit diff expands, rows non-interactive → import shows valid/invalid split
