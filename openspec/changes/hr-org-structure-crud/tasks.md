# HR Org Structure — Finish the CRUD: Tasks

> No DB migration: `department`/`position` already carry `deleted_at` via `auditColumns` and
> `reporting_line` already exists (`packages/db/src/schema/hr/`).

## 1. Contracts — `packages/contracts/src/dto/hr.ts`

- [ ] 1.1 Add `UpdateDepartmentRequest` (`{ name?, parent_id? }`, `parent_id` nullable) and
  `UpdatePositionRequest` (`{ title?, job_description?, department_id? }`, `job_description`
  nullable) — partial bodies, same "provided fields replace stored values" doc comment as
  `UpdateEmployeeRequest`
- [ ] 1.2 Add `EmployeeRef` (`{ id, emp_code, first_name, last_name }`), `ReportingLine`
  (`{ manager: EmployeeRef.nullable(), direct_reports: z.array(EmployeeRef) }`) and
  `SetReportingLineRequest` (`{ manager_employee_id: uuid.nullable() }`)
- [ ] 1.3 Add the endpoints to `hrContract`: `updateDepartment` (`PUT /departments/:id` → 200
  `{ department }`), `deleteDepartment` (`DELETE /departments/:id`, `body: c.noBody()`, →
  `204: z.void()`), `updatePosition`, `deletePosition` (same shapes), `getReportingLine`
  (`GET /employees/:id/reporting-line` → 200 `{ reporting_line: ReportingLine }`),
  `setReportingLine` (`PUT /employees/:id/reporting-line` → 200 `{ reporting_line }`).
  Follow `deleteRole` for the DELETE shape; summaries state the guard ("409 while in use")
- [ ] 1.4 Export the new DTO types from the package barrel
- [ ] 1.5 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 2. API — `apps/api/src/hr`

- [ ] 2.1 `employee.service.ts`: `updateDepartment(id, input, actor)` — load the row (404 via
  `NotFoundError` if missing or soft-deleted), run the ancestor guard when `parent_id`
  changes, patch `name`/`parentId` + `updatedBy`, return the `Department` shape
- [ ] 2.2 `employee.service.ts`: private `assertNoDepartmentCycle(id, newParentId)` — walk up
  `parent_id` from `newParentId` on `currentExecutor(db)`; `BusinessRuleError` on reaching
  `id` (self-reference is depth 0) or on exceeding a 256-hop limit (design D3)
- [ ] 2.3 `employee.service.ts`: `deleteDepartment(id, actor)` — count live child departments
  and live positions in the same tx; `StateConflictError` naming the blocking count, else
  stamp `deletedAt`/`updatedBy` (design D2)
- [ ] 2.4 `employee.service.ts`: `updatePosition(id, input, actor)` (retitle, edit
  `job_description`, move `department_id` — validate the target department exists and is
  live) and `deletePosition(id, actor)` (409 while any employee holds it; employees keep
  their `position_id` either way, design D4)
- [ ] 2.5 `employee.service.ts`: `getReportingLine(id)` — join `reporting_line` for the
  manager and select the reverse side for `direct_reports`, projecting `EmployeeRef` only
  (no salary/PII, design D5)
- [ ] 2.6 `employee.service.ts`: `setReportingLine(id, input, actor)` — assert both employees
  exist, run `assertNoManagerCycle(id, managerId)` (the same upward walk over
  `manager_employee_id`), then `insert(...).onConflictDoUpdate` on `employee_id`; `null`
  clears
- [ ] 2.7 Write `AuditService.record` inside each mutation's transaction — `entityType`
  `department` | `position` | `reporting_line`, action `UPDATE`/`DELETE`, `before`/`after`
  snapshots (design D6); inject `AuditService` into `EmployeeService` and make sure
  `HrModule` imports the audit module
- [ ] 2.8 `hr.controller.ts`: six `@TsRestHandler`s beside the existing org handlers —
  `assertPermissions(user, "hr.employee.view")` for the reporting-line read,
  `"hr.employee.manage"` for every mutation, each mutation wrapped in
  `this.uow.withTransaction(...)`
- [ ] 2.9 Verify: `pnpm --filter @erp/api typecheck && pnpm --filter @erp/api lint`

## 3. Web — `apps/web/src`

- [ ] 3.1 `hr/queries.ts`: `useUpdateDepartmentMutation`, `useDeleteDepartmentMutation`,
  `useUpdatePositionMutation`, `useDeletePositionMutation` (invalidate
  `hrKeys.departmentsAll()`/`positionsAll()`), plus `useReportingLineQuery(employeeId)` and
  `useSetReportingLineMutation` with a `hrKeys.reportingLine(id)` key
- [ ] 3.2 `router/routes/hr/org-structure.tsx`: give both drawers an optional `editing` prop
  (seed fields, switch title/submit label, dispatch update instead of create — design D7)
- [ ] 3.3 `router/routes/hr/org-structure.tsx`: add Edit/Delete row actions to both Data
  Tables, gated on `hr.employee.manage` so they are absent (not disabled) without it; Delete
  opens `ConfirmDialog` with the consequence text and renders a 409's `message` inline
- [ ] 3.4 `router/routes/hr/employee-detail.tsx`: replace the `reportingEmpty` placeholder
  with the Reporting tab — manager `Combobox` over employees (clearable, `PermissionButton`
  save) and a read-only direct-reports list; read-only rendering without
  `hr.employee.manage`
- [x] 3.5 `router/routes/hr/employee-detail.tsx`: show the position in the Profile tab and
  make it editable in the profile edit form (`NO_POSITION` sentinel → `position_id: null`)
  — *shipped ahead of this change; covered by `employee-detail.test.tsx`*
- [ ] 3.6 Add the new `hr` i18n keys to **both** `resources/en.ts` and `resources/th.ts`
  (edit/delete labels, confirm copy, manager/direct-reports labels) — the i18n completeness
  test fails on any key present in one locale only
- [ ] 3.7 Verify: `pnpm --filter @erp/web typecheck && pnpm --filter @erp/web lint`

## 4. Tests

- [ ] 4.1 `apps/api/test/integration/hr.int.spec.ts`: rename + re-parent a department; reject
  a re-parent into its own subtree (422); reject deleting a department with a live child and
  with a live position (409); reject deleting an occupied position (409); soft-delete an
  unreferenced position and assert it vanishes from `GET /positions` while the employee row
  keeps its `position_id`
- [ ] 4.2 `apps/api/test/integration/hr.int.spec.ts`: set/change/clear a reporting line
  (one row, upserted), read manager + direct reports, reject a managerial cycle (422),
  assert the response carries no salary or national-id fields
- [ ] 4.3 `apps/api/test/integration/hr.int.spec.ts`: assert an `audit_log` row with
  `before`/`after` lands for one update and one delete
- [ ] 4.4 `apps/web/src/router/routes/hr/org-structure.test.tsx`: edit a department through
  the seeded drawer; delete behind the confirm dialog; a 409 keeps the dialog open with its
  message; no row actions for a view-only user
- [ ] 4.5 `apps/web/src/router/routes/hr/employee-detail.test.tsx`: Reporting tab renders the
  manager and direct reports, assigns a manager, and clears one
- [ ] 4.6 `e2e/tests/hr-module.spec.ts`: extend the org-structure pass — create a department,
  rename it, try to delete it while it holds a position (refused), delete the position, then
  the department
- [ ] 4.7 Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green, then the
  integration suite against the live stack
