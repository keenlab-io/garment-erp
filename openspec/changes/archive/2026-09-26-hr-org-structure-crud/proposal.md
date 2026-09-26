# HR Org Structure — Finish the CRUD

## Why

`openspec/specs/employee-management/spec.md` §"Organization structure" promises the system
manages `department`, `position`, and `reporting_line` "via CRUD endpoints". M2 shipped only
**C** and **R**: `hrContract` has `listDepartments`/`createDepartment`/`listPositions`/
`createPosition` and nothing else, and `reporting_line` has no endpoint at all — the table
exists in `packages/db/src/schema/hr/employee.ts` and is never read or written by any code.

The practical consequences, all reachable in the shipped UI today:

- A department typo is permanent. A department cannot be re-parented, so the org tree can
  only ever be built correctly on the first try.
- A position cannot be renamed, given a job description, or moved to another department —
  the only correction is to create a replacement and re-assign every employee by hand.
- Nothing can be removed. `department`/`position` both carry `deleted_at` (the shared
  `auditColumns`) and both list queries already filter on `notDeleted(...)`, so the
  soft-delete machinery is in place and simply has no endpoint driving it.
- The employee detail's **Reporting** tab renders `reportingEmpty` — "Reporting line isn't
  available yet" — because there is no read surface for a manager.

This change closes all three gaps against the requirement already in the specs, rather than
adding new scope.

## What Changes

- **Department update/delete**: `PUT /departments/{id}` (rename, re-parent) and
  `DELETE /departments/{id}` (soft delete). Re-parenting is **cycle-guarded** — a department
  may not become its own ancestor. Deletion is refused with 409 while the department still
  has live children or live positions.
- **Position update/delete**: `PUT /positions/{id}` (retitle, edit `job_description`, move to
  another department) and `DELETE /positions/{id}` (soft delete). Deletion is refused with
  409 while any live employee still holds the position; the employee's `position_id` is
  never silently nulled.
- **Reporting line**: `GET /employees/{id}/reporting-line` returns the manager plus the
  employee's direct reports; `PUT /employees/{id}/reporting-line` upserts the row and accepts
  `manager_employee_id: null` to clear it. Cycle-guarded — an employee may not be their own
  manager, directly or transitively.
- **Org structure screen** (`apps/web/src/router/routes/hr/org-structure.tsx`): each row in
  both Data Tables gains Edit and Delete actions. The existing create drawers become
  create-or-edit drawers; delete goes through `ConfirmDialog` and surfaces the API's in-use
  409 as an inline message rather than a bare toast.
- **Reporting tab** (`apps/web/src/router/routes/hr/employee-detail.tsx`): replaces the empty
  state with the manager (a `Combobox` over employees, clearable, `hr.employee.manage`-gated)
  and a read-only list of direct reports.
- **Audit**: every org mutation writes an `audit_log` row via the M0 `AuditService`
  (`UPDATE`/`DELETE` on `department`/`position`/`reporting_line`) with `before`/`after`.
  The HR module writes no audit rows today; destructive org edits are where that starts.

Not in scope: hard deletion, restoring a soft-deleted department or position (a new row is
the answer), position headcount/establishment limits, and an org **chart** visualization —
the reporting tab is a manager field plus a list.

## Capabilities

### Modified Capabilities

- `employee-management`: the "Organization structure" requirement is tightened from a general
  "via CRUD endpoints" claim into the concrete update/delete endpoints, their referential
  guards (in-use 409, ancestor cycles), soft-delete semantics, and the reporting-line read and
  write surface with its own cycle guard.
- `employee-management-ui`: the org-structure screen gains row-level edit/delete with
  confirmation, and the employee detail's Reporting tab becomes a real manager editor instead
  of an empty state.

## Impact

- **Packages**
  - `@erp/contracts` — `dto/hr.ts` gains `UpdateDepartmentRequest`, `UpdatePositionRequest`,
    `ReportingLine`, `SetReportingLineRequest` and five endpoints (`updateDepartment`,
    `deleteDepartment`, `updatePosition`, `deletePosition`, `getReportingLine`,
    `setReportingLine`). `Department`/`Position` response shapes are unchanged.
  - `@erp/db` — **no schema change and no migration**: `department`/`position` already carry
    `deleted_at` via `auditColumns`, and `reporting_line` already exists.
  - `apps/api` — `EmployeeService` grows the update/delete/reporting-line methods and two
    private cycle checks; `HrController` grows the matching `@TsRestHandler`s
    (`hr.employee.view` to read, `hr.employee.manage` to mutate); `HrModule` takes
    `AuditService`.
  - `apps/web` — `hr/queries.ts` gains the mutations and the reporting-line query;
    `org-structure.tsx` and `employee-detail.tsx` change; new `hr` i18n keys in **both**
    `en.ts` and `th.ts` (the completeness test enforces parity).
- **Sequencing vs M7** — this change touches `apps/api/src/hr` and `dto/hr.ts`, which
  `m7-tenancy-core` task 9 sweeps for `tenant_id`. It is independent of M7 and can land
  either side of it; if M7 lands first, the new queries take the same tenant scoping as
  their siblings, which the M7 parity test will catch.
- **Tests** — `apps/api/test/integration/hr.int.spec.ts` (guards + soft-delete invisibility),
  the two web route test files, and a Playwright pass over `e2e/tests/hr-module.spec.ts`.
