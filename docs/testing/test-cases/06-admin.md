# 06 — Admin & Access (`/admin`) test cases

UI test cases for the M1 Admin & Access module (super-admin only): users, roles with the
permission-matrix editor, the audit log with before/after diffs, and the atomic permission import.
High-risk focus: role delete with re-auth, force-logout, permission-import validation, and
permission-matrix edit correctness.

**Coverage checklist**

- [x] Smoke: `/admin` loads, users list renders (TC-ADMIN-01)
- [x] Golden path: create user → assign roles → status toggle (TC-ADMIN-02)
- [x] Permission gate: non-super-admin cannot see or reach `/admin` (TC-ADMIN-03)
- [x] High-risk: force-logout with re-auth + session revocation (TC-ADMIN-04)
- [x] Roles: create with matrix/template, clone (TC-ADMIN-05)
- [x] High-risk: permission-matrix edit correctness (TC-ADMIN-06)
- [x] High-risk: role delete re-auth + 409 blocked path (TC-ADMIN-07)
- [x] Audit log filters + before/after diff (TC-ADMIN-08)
- [x] High-risk: permission import validation → commit (TC-ADMIN-09)

> All cases run as the seeded `superadmin` (password `changeme` or `SEED_SUPERADMIN_PASSWORD`)
> except TC-ADMIN-03/04, which additionally need a second real user — created inside the case
> itself via the Admin UI. Admin is unaffected by the no-`VITE_DEV_PERMISSIONS` constraint since
> the super-admin seed exists.

---

### TC-ADMIN-01 — Smoke: Admin module loads and users list renders
- **Target**: App @ :5173 `/admin`
- **Persona**: super-admin
- **Preconditions**: logged in as `superadmin`
- **Priority**: smoke
- **Steps**:
  1. Find "Admin & Access" in the sidebar (bottom-anchored, below the module list) and click it.
  2. Observe the landing screen.
- **Expected**:
  1. URL becomes `/admin/users` (module root redirects to first child); admin sub-nav shows Users, Roles, Audit log, Import.
  2. Heading "Users"; DataTable with columns Username (mono), Email, Status, Roles, Last login; the `superadmin` row is present with an "Active" chip; "Last login" shows a timestamp or "Never".
  3. Toolbar status filter (accessible name "Status") with options "All statuses", "Active", "Pending", "Disabled"; "Create user" button top-right.
- **Automation notes**: sidebar admin group has its own nav landmark (aria-label "Admin navigation"). Cursor pagination: "Next" disables when `next_cursor` is null.

### TC-ADMIN-02 — Golden path: create user → assign roles → toggle status
- **Target**: App @ :5173 `/admin/users` → `/admin/users/$id`
- **Persona**: super-admin
- **Preconditions**: at least one non-system role exists (create via TC-ADMIN-05 or use a seeded role)
- **Priority**: golden-path
- **Steps**:
  1. Click "Create user". In the drawer "Create user" fill "Username" = `hr.clerk`, "Email" = `hr.clerk@example.com`, pick a role in "Roles" (multi-combobox), "Temporary password" = `Temp#12345`. Click the drawer's "Create user" submit.
  2. Locate the `hr.clerk` row; row-action menu → "View details".
  3. In the "Roles" section, add/remove a role in the combobox and click "Save roles".
  4. In the "Account status" section, change the select to "Disabled" and click "Save status".
  5. Sign out; attempt to sign in as `hr.clerk`.
  6. Sign back in as `superadmin`, re-enable the user ("Active" + "Save status").
- **Expected**:
  1. Toast "Create user"; drawer closes; row `hr.clerk` appears with status chip "Pending" (or "Active" per backend default) and its role names in the Roles column.
  2. Detail shows back-link "Back to users", h1 `hr.clerk` + status chip, email, and sections: Roles, Account status, Sessions ("No recorded sign-ins yet." before first login), Activity.
  3. Role save fires `PUT /users/:id/roles` with the chosen `role_ids`; combobox reflects the saved set after refetch.
  4. Status save fires `PUT /users/:id/status`; chip in the header updates to "Disabled".
  5. Disabled login is rejected on `/login` with the danger badge "Incorrect username or password." (or a status-specific error).
  6. The Activity section (audit) gains entries for the role/status changes.
- **Automation notes**: endpoints `POST /users`, `PUT /users/:id/roles`, `PUT /users/:id/status`. Drawer submit shares the name "Create user" with the header button and the success toast — scope to `getByRole("dialog")`. Flag: no cleanup endpoint for test users (no delete-user) — reuse or disable them between runs.

### TC-ADMIN-03 — Permission gate: non-super-admin cannot see or reach Admin
- **Target**: App @ :5173 `/admin/users`
- **Persona**: any non-super-admin (e.g. the `hr.clerk` user from TC-ADMIN-02 with an HR role)
- **Preconditions**: `hr.clerk` exists, Active, with a non-admin role; signed in as `hr.clerk`
- **Priority**: permission-gate
- **Steps**:
  1. Inspect the sidebar and mobile tab bar for "Admin & Access".
  2. Open the command palette (Cmd/Ctrl-K) and search "users", "roles", "audit".
  3. Navigate directly to `/admin/users`, then `/admin/roles`, `/admin/import`.
- **Expected**:
  1. "Admin & Access" is **absent** from the DOM (not disabled) — `superAdminOnly` modules are stripped by `filterNav`.
  2. No admin entries in the palette.
  3. Direct navigation never renders an admin screen — the `beforeLoad` guard redirects to an accessible route; no `GET /users` request fires.
- **Automation notes**: assert redirect target URL and absence via `queryByText`. This is the module-level gate; in-screen admin actions need no separate gate cases since every admin viewer is super-admin.

### TC-ADMIN-04 — High-risk: force-logout — re-auth dialog + session revocation
- **Target**: App @ :5173 `/admin/users/$id` (session-list + force-logout)
- **Persona**: super-admin (+ the target user in a second browser context)
- **Preconditions**: `hr.clerk` exists and has signed in at least once (so Sessions shows the last sign-in); keep `hr.clerk` signed in in a second browser context
- **Priority**: high-risk
- **Steps**:
  1. Open `hr.clerk`'s detail. In "Sessions", verify the session row (created/last-active timestamps from last sign-in) and the header's destructive "Force logout" button.
  2. Click "Force logout". In the dialog "Force logout hr.clerk?" read the consequence ("This immediately revokes every active session for hr.clerk.").
  3. Try to confirm with the "Super-Admin password" field (placeholder "Re-enter to authorize") empty.
  4. Enter the super-admin password and confirm ("Force logout").
  5. In the second browser context, have `hr.clerk` perform any action (navigate/refetch).
- **Expected**:
  1. The session row's revoke action opens the **same** guarded dialog (there is no per-session revoke primitive).
  2. Confirm is blocked while the password is empty (requirePassword preset).
  3. Success toast (title "Force logout"); `POST /users/:id/force-logout` fires.
  4. `hr.clerk`'s next request fails auth; the app redirects to `/login?notice=reauth` showing the warning badge "Your access changed. Please sign in again."
- **Automation notes**: two-context Playwright test. **Flag (gap):** the contract has no session-list endpoint — the "Sessions" section is derived solely from `last_login_at`, so multi-session display cannot be asserted. Note: like cash-advance approve, verify at runtime whether the typed password is actually transmitted (`forceLogout` body is `undefined` in `iam/queries.ts`) — wrong-password rejection may not be assertable; flag to backend if so.

### TC-ADMIN-05 — Roles: create with matrix + template, then clone
- **Target**: App @ :5173 `/admin/roles`
- **Persona**: super-admin
- **Preconditions**: none
- **Priority**: golden-path
- **Steps**:
  1. Open `/admin/roles` (heading "Roles", columns Name, Permissions, Users; "Create role" button).
  2. Click "Create role". Fill "Name" = `HR Clerk`, "Description" = `HR ops`; leave "Start from template" = "None".
  3. In the permission matrix tick `hr.employee.view`, `hr.employee.manage`, `hr.ot.approve` (checkboxes are labeled by their permission code).
  4. Click "Save as template"; enter `HR base` at the "Template name" prompt.
  5. Submit with "Create role".
  6. On the new row's action menu choose "Clone". In the dialog "Clone HR Clerk", accept the prefilled "New role name" `HR Clerk copy` and click "Clone role".
- **Expected**:
  1. Toast for template save ("Save as template"); the template later appears in "Start from template" and pre-ticks its codes when selected.
  2. Role list shows `HR Clerk` with Permissions = 3 and Users = 0.
  3. Clone navigates to `/admin/roles/{newId}` showing `HR Clerk copy` with the identical permission set pre-checked in the matrix.
- **Automation notes**: matrix checkboxes: `getByRole("checkbox", { name: "hr.employee.view" })`. "Save as template" uses `window.prompt` — Playwright: `page.on("dialog", d => d.accept("HR base"))`. Endpoints: `POST /roles`, `POST /roles/:id/clone`, `POST /role-templates`.

### TC-ADMIN-06 — High-risk: permission-matrix edit correctness on role detail
- **Target**: App @ :5173 `/admin/roles/$id` (permission-matrix)
- **Persona**: super-admin
- **Preconditions**: role `HR Clerk` (TC-ADMIN-05) assigned to ≥1 active user (`hr.clerk` from TC-ADMIN-02); a system role also exists for the negative checks
- **Priority**: high-risk
- **Steps**:
  1. Open `HR Clerk`'s detail: back-link "Back to roles", h1 role name, section "Permissions", buttons "Clone", "Delete", "Save changes".
  2. Verify "Save changes" is disabled before any edit.
  3. In the matrix grid, tick `sales.quotation.manage` and untick `hr.ot.approve`. Verify keyboard support: focus a checkbox, move with arrow keys (roving tabindex — exactly one tab stop), toggle with space.
  4. Locate the salary/cost special group **below** the grid: captioned "Salary & cost visibility — grant these separately to avoid accidental over-exposure." with Switch toggles (`hr.salary.view`, `hr.salary.edit`, `inventory.cost.view`, …); toggle `hr.salary.view` on.
  5. Click "Save changes". In the dialog "Save role changes?" read the body ("This will affect 1 active user(s) — they will be force re-authenticated.") and confirm.
  6. Reload the page and verify persisted state.
  7. Have `hr.clerk` (second context) make a request.
  8. Open a **system role**: verify the "System role" badge, that "Delete" is disabled, and try unticking its last remaining permission.
- **Expected**:
  1. Dirty-tracking: "Save changes" enables only after a change; the affects-N caption reflects the live user count.
  2. `PUT /roles/:id` carries exactly the final `permission_codes` set; after reload the matrix shows the saved set (added codes checked, removed unchecked, salary switch on).
  3. `hr.clerk` is force re-authenticated (redirect to `/login?notice=reauth`) since role grants changed.
  4. System role: last-permission removal is blocked with the message "A system role must keep at least one permission."; Delete stays disabled.
- **Automation notes**: matrix is `table[role="grid"]` per module with `aria-label`-coded checkboxes — ideal Playwright hooks. Module groups collapse/expand via buttons "Collapse {module}"/"Expand {module}". Flag: the affects-N count comes from the roles-list summary query — assert the count text, not a live session count.

### TC-ADMIN-07 — High-risk: role delete — re-auth password + 409 blocked path
- **Target**: App @ :5173 `/admin/roles` and `/admin/roles/$id`
- **Persona**: super-admin
- **Preconditions**: role `HR Clerk copy` (unused, 0 users) and role `HR Clerk` (assigned to `hr.clerk`)
- **Priority**: high-risk
- **Steps**:
  1. On the roles list, open `HR Clerk copy`'s row menu → "Delete" (destructive item).
  2. In "Delete role HR Clerk copy?" read the consequence ("This permanently deletes the role HR Clerk copy."); try to confirm with the "Super-Admin password" empty.
  3. Type a **wrong** password and confirm ("Delete role").
  4. Type the correct super-admin password and confirm.
  5. Now delete `HR Clerk` (still bound to a user) the same way, with the correct password.
  6. Click the "Go to Users" link in the blocker.
- **Expected**:
  1. Confirm blocked while password empty (requirePassword preset; destructive styling).
  2. Wrong password: the API rejects (`DELETE /roles/:id` body carries `super_admin_password`) — an error surfaces and the role is **not** deleted. (Unlike cash-advance, this password IS transmitted.)
  3. Correct password: `HR Clerk copy` disappears from the list.
  4. Bound role: backend answers **409**; the dialog closes and an inline warning renders: "1 user(s) still use this role — reassign them from Users, then delete again." with a "Go to Users" link — not a dead-end error.
  5. The link navigates to `/admin/users`.
- **Automation notes**: same flow exists on role detail (`/admin/roles/$id` Delete button + inline blocker). Flag: the wrong-password error rendering is generic (uniform error envelope) — verify at runtime what the toast/message says and pin it; no bespoke invalid-password copy exists in `iamEn`.

### TC-ADMIN-08 — Audit log: filters, expandable before/after diff, pagination
- **Target**: App @ :5173 `/admin/audit` (audit-table + before-after-diff)
- **Persona**: super-admin
- **Preconditions**: prior admin activity exists (TC-ADMIN-02/05/06 generate role/user audit rows)
- **Priority**: golden-path
- **Steps**:
  1. Open `/admin/audit`: heading "Audit log"; filters "Entity type" (placeholder "e.g. role, user"), "Actor user ID", "From", "To"; table columns Time, Actor, Action, Entity, Reason.
  2. Type `role` into "Entity type".
  3. On a role-update row click "Show details".
  4. Verify the diff, then click "Hide details".
  5. Set a "From" date in the future.
  6. Clear filters; if more rows than one page exist, click "Next" then "Previous".
- **Expected**:
  1. Rows filter to `entity_type=role`; changing any filter resets pagination to the first page.
  2. The expanded row shows the before/after diff: headings "Before" and "After", changed fields listed with "—" for empty values, or "No field changes recorded." for create-only entries.
  3. Future From-date yields "No audit entries match these filters."
  4. Cursor pagination works; rows are immutable — no row actions exist anywhere in the table.
  5. System-actor entries render actor as "System".
- **Automation notes**: `GET /audit?entity_type=…&actor=…&from=…&to=…&cursor=…`; From/To are date inputs converted to ISO day bounds. Expand toggles are per-row buttons "Show details"/"Hide details".

### TC-ADMIN-09 — High-risk: permission import — upload → validation errors → fix → commit
- **Target**: App @ :5173 `/admin/import` (import-validation-table)
- **Persona**: super-admin
- **Preconditions**: two fixture files: `roles-bad.xlsx` (contains a row with an unknown permission code and a row missing the role name) and `roles-good.xlsx` (all valid). **Note: the importer takes Excel `.xlsx`, not CSV** — the dropzone hint reads "or click to browse — .xlsx files only".
- **Priority**: high-risk
- **Steps**:
  1. Open `/admin/import`: heading "Permission import", description ("Upload an Excel file mapping role names to permission codes. Rows with an unknown permission code fail the whole import; rows missing a role name are skipped."), dropzone "Drop an Excel file here" with "Browse files".
  2. Before any upload, verify the placeholder "Upload a file to see the validation review."
  3. Upload `roles-bad.xlsx` (drag onto the dropzone or via the hidden input).
  4. Inspect the validation table (columns Row, Status, Reason).
  5. Upload `roles-good.xlsx` via "Fix & re-upload".
  6. Verify the outcome; click "Import N valid row(s)" once more.
  7. Open `/admin/roles` to verify the imported roles.
- **Expected**:
  1. Unknown-permission-code file: the whole import fails atomically — every offending row shows Status "Error" with its reason; **no roles are created**; no success badge.
  2. A missing-role-name row is *skipped*, not fatal: response shows it as an "Error" row with a skip reason while valid rows import; success badge "Imported N role(s)." appears.
  3. Good file: all rows "OK"; badge "Imported N role(s)."; the roles exist in `/admin/roles` with the mapped permission counts.
  4. Re-clicking import re-submits the same file safely (upsert by role name — counts unchanged, no duplicates).
- **Automation notes**: dropzone is a `role="button"` wrapper with a hidden file input labeled "Browse files" — `setInputFiles` on the input. Endpoint `POST /iam/import` (multipart). **Flag (gap):** there is **no dry-run** — selecting a file *both validates and applies* it in one atomic call (screen docstring); the "validation review" is post-hoc. Also flag: OK-row numbers are inferred assuming a contiguous sheet — don't assert exact row numbers for OK rows on sheets with blank lines. Fixture `.xlsx` files must be committed to the repo (none exist today).

---

**Flagged gaps (Admin)**

1. No delete-user endpoint — test users accumulate; disable them between runs.
2. No session-list endpoint — the Sessions section shows only the last sign-in; multi-session revocation is observable only via the second-context logout effect.
3. Force-logout dialog collects a Super-Admin password but `forceLogout` is called with an empty body — confirm at runtime whether re-auth is actually enforced server-side; if not, flag to backend (role delete DOES transmit `super_admin_password`).
4. Permission import has no dry-run (upload = apply) and expects `.xlsx`, not CSV; no fixture files are committed.
5. Wrong-password role-delete error copy is the generic error envelope — no dedicated i18n string to assert.
6. Zero `data-testid`s; the permission matrix's code-labeled checkboxes are the strongest hooks in the module — keep them stable.
