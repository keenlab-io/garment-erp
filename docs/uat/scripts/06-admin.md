# 06 — Admin & Access UAT script

Business acceptance scenarios for the Admin & Access module (**Super Admin only**): user
accounts and their status, roles and the permission matrix, forced logout, role deletion
safeguards, the audit trail, and bulk permission import.

Audience: Super Admin / IT. For environment bring-up see `docs/testing/UI_TEST_PLAN.md`
§Quickstart; engineer-level detail for the same screens lives in
`docs/testing/test-cases/06-admin.md`. Roles and permission bundles are defined once in
`docs/uat/UAT_PLAN.md`.

> **Run UAT-ADMIN-02 before everything else.** The system ships with exactly one account —
> the Super Admin — and **no** other users or roles. UAT-ADMIN-02 below is the persona-
> provisioning procedure that creates the limited business roles and test users which
> **every role-gated scenario in scripts 01–05 depends on** (HR officer, sales staff,
> warehouse staff, restricted "no salary / no cost visibility" personas, and so on). If
> UAT-ADMIN-02 fails, mark all dependent scenarios **Blocked**, not Fail.

**Coverage checklist**

- [ ] Orientation: admin area opens and the user register reads correctly (UAT-ADMIN-01)
- [ ] Golden workflow: provision a role + test user (the setup dependency for all role-gated UAT) (UAT-ADMIN-02)
- [ ] Role acceptance: ordinary staff can neither see nor reach Admin (UAT-ADMIN-03)
- [ ] User status: disable blocks sign-in; re-enable restores it (UAT-ADMIN-04)
- [ ] Force-logout with re-authentication — instant session revocation (UAT-ADMIN-05)
- [ ] Roles: save-as-template and clone (UAT-ADMIN-06)
- [ ] Permission-matrix edit — an online user is signed out until they log in again (UAT-ADMIN-07)
- [ ] Role delete: password-guarded; refused while users still hold the role (UAT-ADMIN-08)
- [ ] Audit log shows every permission change with before/after (UAT-ADMIN-09)
- [ ] Permission import: bad file rejected whole, good file applied (UAT-ADMIN-10)
- [ ] Account lockout: repeated wrong passwords lock the account temporarily (UAT-ADMIN-11)

---

### UAT-ADMIN-01 — Orientation: the admin area opens on a readable user register
- **Business role**: Super Admin / IT
- **Business goal**: Confirm the administration area is reachable and the user register is trustworthy at a glance.
- **Preconditions / test data**: Signed in as the seeded Super Admin.
- **Steps**:
  1. Open **Admin & Access** from the main navigation (it sits apart at the bottom, below the business modules).
  2. Review the landing screen and the admin sub-sections.
- **Expected result**:
  1. The admin area opens on **Users**, with sub-sections for Users, Roles, Audit log, and Import.
  2. The register lists the Super Admin account with an **Active** status chip, its email, roles, and last sign-in (or "Never").
  3. A status filter (All / Active / Pending / Disabled) and a **Create user** action are available.
- **Acceptance criterion**: The Super Admin can reach the user register and read account status without help.
- **Traces to**: UX Acceptance — verified module map (UAT context brief §4, M1): "`UserStatus` = PENDING / ACTIVE / DISABLED."
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-ADMIN-02 — Golden workflow: provision a role and a test user (setup for all role-gated UAT)
- **Business role**: Super Admin / IT
- **Business goal**: Create a limited business role and a working test user for it — the procedure repeated (with different bundles) for every persona in the UAT_PLAN roles table.
- **Preconditions / test data**: None beyond the seeded Super Admin. Have the UAT_PLAN roles table open — it lists exactly which permissions each business role receives.
- **Steps**:
  1. In **Roles**, create a role named **HR Officer (UAT)** with a short description. In the permission matrix, tick exactly the permissions the UAT_PLAN roles table specifies for the HR officer. Note that salary/cost visibility permissions sit in a separate clearly-captioned group so they are granted deliberately, never by accident.
  2. Save the role and confirm it appears in the roles list with the expected permission count and zero users.
  3. In **Users**, create user **hr.officer.uat** with an email, the new role, and a temporary password.
  4. Read the new row's status.
  5. Sign out, then sign in as **hr.officer.uat** with the temporary password.
- **Expected result**:
  1. The role saves and lists with the correct permission count.
  2. The new user appears in the register as **Pending** (a newly created, not-yet-signed-in account).
  3. The first sign-in succeeds; the user lands in the app seeing **only** the modules their role permits (verified per-module in scripts 01–05).
  4. Back in the register (as Super Admin), the user's last sign-in is now recorded.
- **Acceptance criterion**: A freshly provisioned role + user can sign in and sees exactly their entitled workspace — repeatable for every UAT persona.
- **Traces to**: UX Acceptance — verified module map (UAT context brief §4, M1): "**User provisioning** — create user (username, email, role, temp password) → user PENDING."
- **Note**: There is no way to delete a user — retire test accounts by disabling them (UAT-ADMIN-04) when the UAT round ends.
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-ADMIN-03 — Role acceptance: ordinary staff can neither see nor reach Admin
- **Business role**: HR officer (the test user from UAT-ADMIN-02)
- **Business goal**: Prove the administration area is invisible and unreachable to everyone but the Super Admin.
- **Preconditions / test data**: hr.officer.uat provisioned and able to sign in (UAT-ADMIN-02).
- **Steps**:
  1. Sign in as hr.officer.uat and inspect the main navigation (desktop sidebar and, on a phone-sized window, the tab bar).
  2. Search the app-wide command search for "users", "roles", "audit".
  3. Attempt to reach the admin screens directly via a bookmarked admin link from the Super Admin session.
- **Expected result**:
  1. **Admin & Access** does not appear anywhere in the navigation — absent, not greyed out.
  2. The command search offers no admin destinations.
  3. Direct attempts never display an admin screen — the user is redirected to a page they are entitled to.
- **Acceptance criterion**: A non-super-admin has no route, visible or typed, into administration.
- **Traces to**: UX Acceptance — verified module map (UAT context brief §4, M1): "Admin & Access (M1) — super-admin only."
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-ADMIN-04 — User status: disabling an account blocks sign-in; re-enabling restores it
- **Business role**: Super Admin / IT
- **Business goal**: Switch an account off (leaver, security concern) and back on, with immediate effect at the login screen.
- **Preconditions / test data**: hr.officer.uat exists (UAT-ADMIN-02).
- **Steps**:
  1. Open hr.officer.uat's account page; set the account status to **Disabled** and save.
  2. Sign out and attempt to sign in as hr.officer.uat with the correct password.
  3. Sign back in as Super Admin; set the status back to **Active** and save.
  4. Sign in as hr.officer.uat again.
- **Expected result**:
  1. The account page and the register both show the **Disabled** chip after saving.
  2. The disabled sign-in is refused with a clear message; the user never reaches the app.
  3. After re-enabling, sign-in succeeds normally.
- **Acceptance criterion**: Status changes take effect at the very next sign-in attempt, in both directions.
- **Traces to**: UX Acceptance — verified module map (UAT context brief §4, M1): "`UserStatus` = PENDING / ACTIVE / DISABLED."
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-ADMIN-05 — Force-logout: guarded re-authentication, instant revocation
- **Business role**: Super Admin / IT (with the target user signed in on a second browser/device)
- **Business goal**: Immediately throw a signed-in user out of the system — e.g. a lost device or a suspected compromise.
- **Preconditions / test data**: hr.officer.uat signed in and active in a **second browser window/device**; Super Admin on the first.
- **Steps**:
  1. Open hr.officer.uat's account page and review the sessions section (it reflects the last sign-in).
  2. Choose **Force logout**. Read the dialog's consequence — it states every active session for this user will be revoked immediately.
  3. Try to confirm without entering the Super-Admin password.
  4. Enter the Super-Admin password and confirm.
  5. In the second window, have hr.officer.uat attempt any action (navigate anywhere).
- **Expected result**:
  1. Confirmation is blocked until the password is entered.
  2. On confirm, the action is acknowledged as done.
  3. The user's very next action in the second window fails: they are returned to the sign-in screen with a notice that their access changed and they must sign in again. Nothing they had open remains usable.
- **Acceptance criterion**: Revocation is immediate — the target's next action lands them back at sign-in.
- **Traces to**: UX Acceptance — verified module map (UAT context brief §4, M1): "a guarded **force-logout** (instant revocation)."
- **Note**: The sessions section shows only the most recent sign-in, not a device-by-device list; and this dialog's password prompt is a deliberate-action safeguard — do not use this scenario to test wrong-password rejection (known gap, see `docs/testing/test-cases/06-admin.md`, TC-ADMIN-04).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-ADMIN-06 — Roles: save a permission template, then clone a role
- **Business role**: Super Admin / IT
- **Business goal**: Reuse permission sets instead of rebuilding them — save a bundle as a template and duplicate an existing role.
- **Preconditions / test data**: The HR Officer (UAT) role (UAT-ADMIN-02).
- **Steps**:
  1. Start creating a new role; while ticking its permissions, use **Save as template** and name the template **HR base**.
  2. Finish creating the role, then start another new role choosing **HR base** as the starting template.
  3. On the HR Officer (UAT) role, choose **Clone** and accept the suggested name.
- **Expected result**:
  1. The template appears as a starting choice and pre-ticks its permissions on the new role.
  2. The clone opens as a new role with the identical permission set already ticked and zero users attached.
  3. Both new roles list with the expected permission counts.
- **Acceptance criterion**: Templates and clones reproduce a permission set exactly, with no manual re-ticking.
- **Traces to**: UX Acceptance — verified module map (UAT context brief §4, M1): "**Role authoring** — create role with a permission matrix (optional seed from template / save-as-template), **clone**."
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-ADMIN-07 — Editing a role's permissions signs its online users out until they log in again
- **Business role**: Super Admin / IT (with hr.officer.uat signed in on a second browser/device)
- **Business goal**: Prove that changing what a role may do takes effect immediately for people currently working — they must re-authenticate to continue under the new rules.
- **Preconditions / test data**: hr.officer.uat holds HR Officer (UAT) and is signed in and active in a second window.
- **Steps**:
  1. Open the HR Officer (UAT) role. Confirm the save action is inactive before any change is made.
  2. Tick one additional permission and untick one existing permission in the matrix.
  3. Save. Read the confirmation dialog — it states how many active users the change affects and that they will be re-authenticated. Confirm.
  4. Reload the role page and verify the saved set matches exactly what was ticked.
  5. In the second window, have hr.officer.uat attempt any action.
  6. Have hr.officer.uat sign in again and check their navigation.
- **Expected result**:
  1. The confirmation warns "affects 1 active user" (the live count) before committing.
  2. After reload the matrix shows precisely the new set — additions ticked, removals cleared.
  3. hr.officer.uat's next action returns them to the sign-in screen with the "your access changed" notice — they cannot keep working on the old permissions.
  4. After signing back in, their navigation reflects the new permission set.
- **Acceptance criterion**: A permission change is enforced on an online user's very next action; they resume only after re-login, under the new rules.
- **Traces to**: BACKEND_SPEC M1 §1.8: "Changing an online user's roles ⇒ their next request returns 401 until re-login." (Experienced in the UI as the forced return to sign-in.)
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-ADMIN-08 — Role delete: password-guarded, and refused while users still hold the role
- **Business role**: Super Admin / IT
- **Business goal**: Prove a role cannot be destroyed casually — deletion needs the Super-Admin password, and a role still assigned to staff is protected.
- **Preconditions / test data**: An **unused** role with zero users (the clone from UAT-ADMIN-06) and the **in-use** HR Officer (UAT) role (held by hr.officer.uat).
- **Steps**:
  1. On the unused role, choose **Delete**. Read the dialog's consequence; try to confirm with the password box empty.
  2. Enter a **wrong** password and confirm.
  3. Enter the correct Super-Admin password and confirm.
  4. Now attempt to delete the in-use HR Officer (UAT) role the same way, with the correct password.
  5. Follow the on-screen link the refusal offers.
- **Expected result**:
  1. Confirmation is blocked while the password box is empty; the dialog is visibly destructive.
  2. With a wrong password the deletion is refused and the role remains in the list unchanged.
  3. With the correct password the unused role disappears from the list.
  4. The in-use role is **not** deleted: a clear explanation appears — users still hold this role; reassign them first — with a working link to the Users register. It is guidance, not a dead-end error.
  5. The link lands on the Users register.
- **Acceptance criterion**: Only a correct Super-Admin password deletes a role, and never one that staff still hold.
- **Traces to**: BACKEND_SPEC M1 §1.8: "`DELETE /roles/{id}` without a valid super_admin_password ⇒ 403, no data change, no audit DELETE row." and "Deleting a role still bound to ≥1 user ⇒ 409." (Experienced in the UI as the refusal + reassign-first guidance.)
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-ADMIN-09 — Audit log: every permission change is on the record with before/after
- **Business role**: Super Admin / IT (auditor)
- **Business goal**: Demonstrate an inspectable, tamper-proof trail of who changed access, when, and from what to what.
- **Preconditions / test data**: The activity from UAT-ADMIN-02/06/07/08 has been performed in this session.
- **Steps**:
  1. Open the **Audit log**.
  2. Narrow the list to role-related entries using the filters.
  3. On the entry for the UAT-ADMIN-07 permission change, expand the details.
  4. Set a from-date in the future to test the honest empty state, then clear the filters.
- **Expected result**:
  1. The permission change appears as a **PERMISSION_CHANGE** entry showing who made it (the Super Admin) and when.
  2. The expanded entry shows **Before** and **After** for the changed fields — the removed permission on the before side, the added one on the after side.
  3. The role deletion, user creation, and status changes from earlier scenarios are also present.
  4. Entries are read-only — nothing on this screen can edit or remove history; an impossible filter says plainly that no entries match.
- **Acceptance criterion**: Every access change performed in this script can be found in the log with actor, time, and before/after detail.
- **Traces to**: BACKEND_SPEC M1 §1.8: "Every authz mutation writes one audit_log row (action=PERMISSION_CHANGE, before/after, actor, ts)."
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-ADMIN-10 — Permission import: a bad file is rejected whole; a good file applies cleanly
- **Business role**: Super Admin / IT
- **Business goal**: Bulk-load role definitions from a spreadsheet safely — a file with an invalid permission must not half-apply.
- **Preconditions / test data**: Two Excel files prepared with IT: one **bad** (a row naming a permission that does not exist, plus a row missing its role name) and one **good** (all valid). **The importer accepts Excel files only, not CSV.**
- **Steps**:
  1. Open **Import** and read the on-screen explanation of the expected file.
  2. Upload the **bad** file and review the row-by-row validation results.
  3. Check the Roles list for anything the bad file might have created.
  4. Upload the **good** file and review the results.
  5. Upload the same good file once more.
  6. Check the Roles list again.
- **Expected result**:
  1. The bad file's unknown-permission row fails **the whole import** — every row is reported with its reason and **no roles are created** (all-or-nothing).
  2. A row missing its role name is reported as skipped rather than sinking the import on an otherwise-valid file.
  3. The good file reports all rows OK with a count of imported roles; those roles appear in the Roles list with the expected permission counts.
  4. Re-uploading the same good file does not duplicate anything — role counts are unchanged.
- **Acceptance criterion**: An invalid file changes nothing; a valid file creates exactly its roles, repeatably.
- **Traces to**: UX Acceptance — verified module map (UAT context brief §4, M1): "**Permission import** — upload file to bulk-import."
- **Caution**: There is **no preview step** — uploading a file validates **and applies** it in one action. Use only the prepared UAT fixture files, never a draft of production data.
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-ADMIN-11 — Account lockout: repeated wrong passwords lock the account temporarily
- **Business role**: Super Admin / IT (observing); performed against a provisioned test account
- **Business goal**: Confirm the system protects an account from password-guessing by locking it after several failures — and that even the right password is refused while it is locked.
- **Preconditions / test data**: A provisioned, active test user (e.g. the account from UAT-ADMIN-02) whose password is known. Do **not** use the Super Admin account for this — a lockout would block administration for the lockout window.
- **Steps**:
  1. Sign out. On the sign-in screen, enter the test user's username with a **wrong** password and submit.
  2. Repeat the wrong-password attempt until six consecutive failures have been made.
  3. Now enter the test user's **correct** password and submit.
  4. Wait out the lockout window (about 15 minutes) — or have IT confirm the window — then sign in again with the correct password.
- **Expected result**:
  1. Each wrong attempt is refused with a sign-in error; after the sixth, the account is reported as **temporarily locked**.
  2. While locked, the **correct** password is **still refused** — the lock, not the password, governs.
  3. After the lockout window passes, the correct password signs the user in normally.
- **Acceptance criterion**: Six consecutive bad passwords lock the account for ~15 minutes; during the lock a correct password is still refused; access returns after the window.
- **Traces to**: BACKEND_SPEC M1 §1.8: "6 consecutive bad logins ⇒ account locked 15 min; correct password during lock ⇒ still refused."
- **Note**: The exact threshold (6) and window (15 min) are the documented defaults; if configuration differs in the environment under test, record the observed values rather than failing the scenario.
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence
