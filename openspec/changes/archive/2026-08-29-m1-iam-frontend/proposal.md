# M1 — Access & Identity (Frontend)

## Why

The M0 frontend foundation ships the shell, `@erp/ui`, the permission-aware layer, and a
**placeholder** login route — but no real access-control UI. M1 frontend is what makes the
whole app usable and safe: it wires **real authentication** (replacing the placeholder), and
gives Super-Admins the tools to manage users, roles, and permissions and to review the audit
trail. Its signature screen — the **permission matrix** — is the control surface for every
other module's access.

This is a **UI-only** change: it consumes the `iam` contract in `@erp/contracts` and the M0
foundation. No backend/API surface is added.

## What Changes

- **Real auth**: a login screen that acquires the JWT, stores it, attaches it to the
  `@ts-rest/react-query` client, refreshes it, and forces re-login when `permissions_version`
  changes — replacing M0's placeholder login route + session seam.
- **Admin & Access module** (nav `⚿ Admin & Access`, Super-Admin only, bottom-anchored): Users, Roles, Role
  templates, Audit log, and Excel Import screens, registered as TanStack Router routes gated by
  the `iam.*` permissions.
- Reuses M0's `InkChip`, `DataTable`, `ConfirmDialog` (guarded presets), `MaskedValue`, and the
  role-filtered nav / ⌘K palette — no new shared primitives.

## Capabilities

New:
1. **authentication-ui** — login, token lifecycle, `permissions_version` re-auth.
2. **users-admin** — users list, user detail (roles/sessions/activity), create/edit drawer,
   force-logout, session revoke.
3. **role-editor** — roles list, the **permission-matrix** editor (signature), clone, guarded
   delete, role templates.
4. **audit-log-viewer** — filterable, immutable audit table with before/after diff.
5. **permission-import** — Excel upload + validation-review table.

## Impact

- **Affected code:** `apps/web` (new `iam` routes + screens), consuming the `iam` contract from
  `@erp/contracts` and the M0 `@erp/ui` layer. Adds an `iam` i18next namespace (TH+EN).
- **Depends on:** `m0-frontend-foundation` (shell, `@erp/ui`, permission-aware layer, router,
  i18n) and the backend `m1-iam` contract in `@erp/contracts`.
- **No new dependencies.** No `apps/web` ↔ `apps/api` import (contract-only).
