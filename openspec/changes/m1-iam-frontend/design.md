# M1 — Access & Identity (Frontend): Design

## Context

M1 frontend turns the M0 shell into a governed application. It owns the **authentication seam**
(M0 shipped only a placeholder) and the Super-Admin access-control screens. The signature is the
**permission matrix** — a module×action grid that is the single place roles are shaped. `backend
only` does not apply here; this is `frontend only` and consumes the `iam` contract.

Sequenced **after `m0-frontend-foundation`** and the backend `m1-iam` contract.

## Shared frontend conventions (FD1–FD12)

This change follows the cross-cutting decisions recorded for the frontend module set: build on
`@erp/design-tokens` + `@erp/ui` (FD1); data via `@ts-rest/react-query` against `@erp/contracts`
(FD2); screens as TanStack Router routes whose metadata drives nav + ⌘K (FD3); statuses via
`InkChip` (FD4 — here: audit-action chips, session status); guarded actions via the shared
`ConfirmDialog` presets (FD6 — role delete, force-logout); job-toast for async (FD7); per-module
i18next namespace + locale-dependent dates, **BE in `th` / CE in `en`** (FD8); app isolation
preserved (FD12).

## Module decisions

### MD1. Authentication seam replaces the M0 placeholder
A `/login` route posts credentials to the `iam` auth endpoint, stores the access token (memory +
refresh via httpOnly cookie or refresh endpoint per the backend), and injects it into the
`@ts-rest/react-query` client's `baseHeaders`. The session context exposes `AuthUser` (identity,
`isSuperAdmin`, `Permission[]`) that M0's `PermissionsProvider` already consumes. On a 401 with
a stale `permissions_version` (backend `UNAUTHENTICATED`/`REAUTH_REQUIRED`), the client clears
the session and routes to `/login` with a "your access changed, sign in again" notice.

### MD2. The permission matrix is the signature
Rows = `module.resource`, columns = actions (View/Create/Edit/Delete/Approve/Export), cells =
checkboxes, derived from the `PERMISSIONS` catalog in `@erp/contracts` so the grid can never
drift from real codes. Group headers collapse. **Special permission groups** (`hr.salary.*`,
`inventory.cost.*`) render as distinct, captioned toggles *below* the grid (prevents accidental
over-grant). A **live "affects N users" count** updates as cells change; Save opens a
`ConfirmDialog` stating "N active users will be force re-authenticated." Removing the last
permission of a system role is blocked inline.

### MD3. Guarded role delete with no dead-end
Deleting a role bound to users surfaces the backend 409 as an **inline blocker** ("12 users
still use this role — reassign them first") linking to a filtered users list — never a silent
fail. An unbound role delete uses the re-auth `ConfirmDialog` preset (Super-Admin password).

### MD4. Audit log is visibly immutable
The audit table renders on a **sunken surface with no row actions**; rows expand to a two-column
**before/after diff** with changed fields highlighted. Audit actions render as `InkChip`s. Read-only
is communicated visually, matching the immutability the backend enforces.

### MD5. Excel import validation review
Upload → a validation table shows valid rows (success chip) and invalid rows (danger chip +
reason); the primary CTA reads "Import N valid rows" with a "fix & re-upload" alternative
(partial import, no dead-end).

## Risks / Trade-offs

- **Token storage** (XSS vs CSRF trade-off) — follow the backend's chosen refresh mechanism;
  keep the access token out of `localStorage` where possible. Flagged as an open question with
  the backend auth design.
- **Matrix scale** — the full catalog is large; virtualize rows and lean on group collapse.
- **Masking is UX, not security** — the salary/cost group toggles gate *display*; the backend
  still authorizes.

## Sequencing

After `m0-frontend-foundation` + backend `m1-iam`. First in the UX Part C implementation order
(gates everything else).

## Open Questions

- Exact token storage/refresh contract (memory + refresh cookie vs refresh endpoint).
- Whether role-template management is its own screen or a mode of the role editor (folded into
  `role-editor` for now).
