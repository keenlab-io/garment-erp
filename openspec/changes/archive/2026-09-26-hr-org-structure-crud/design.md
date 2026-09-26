# HR Org Structure — Finish the CRUD: Design

## Context

The org tables are small, admin-edited reference data:

- `department` — `{ id, name, parent_id → department.id }` + `auditColumns`
- `position` — `{ id, title, job_description, department_id → department.id }` + `auditColumns`
- `reporting_line` — `{ employee_id PK → employee.id, manager_employee_id → employee.id }`,
  deliberately kept out of `employee` so the tree can be re-parented without touching the
  master row (its schema comment says exactly this — the re-parenting it was designed for
  was never built)

`auditColumns` supplies `deleted_at`, and `listDepartments`/`listPositions` already filter
`notDeleted(...)`, so soft delete needs no migration. Neither org table spreads
`versionColumn` — `packages/db/src/schema/hr/org.ts` says so explicitly ("the domain here is
small (no optimistic-concurrency version)").

Two existing precedents shape the API surface: `updateEmployee` (`PUT`, partial body,
provided fields replace stored values) and `deleteRole` (`DELETE`, `c.noBody()`, `204: z.void()`,
409 when the role is still bound to a user).

## Goals / Non-Goals

**Goals**

- Make every field of the org tree correctable after creation, with the destructive paths
  guarded rather than cascading.
- Give the Reporting tab a real read/write surface so it stops shipping an "not available
  yet" placeholder.
- Keep the guards in the service layer, where they are covered by integration tests against
  a real Postgres, not in the UI.

**Non-Goals**

- Hard delete, or an "undelete" endpoint.
- Bulk re-assignment of employees when a position is deleted — the request is refused instead.
- Cascading soft-delete from a department to its positions.
- An org-chart visualization.

## Decisions

### D1 — No optimistic concurrency on org rows (no `version`, no `If-Match`)

`PUT /departments/{id}` and `PUT /positions/{id}` are last-write-wins.

Adding `versionColumn` to both tables would mean a migration, a `version` field on the
`Department`/`Position` DTOs, `If-Match` threading through two web screens, and 409 handling —
all to protect two-field reference rows that a handful of HR admins edit occasionally, where a
lost rename is trivially re-applied. The M0 concurrency seam (`assertVersion`) exists for
versioned business documents with state machines; org rows are neither.

What is *not* left to last-write-wins is structure: the cycle and in-use checks below run
inside the same transaction as the write, so concurrent edits cannot produce a cycle or an
orphan even without a version.

**Alternative considered**: add `version` for uniformity. Rejected as cost without a failure
mode to prevent — revisit if positions ever gain state (headcount, effective dating).

### D2 — Delete is soft, and refuses while the row is in use

`DELETE` sets `deleted_at = now()` and `updated_by = actor`. Both list queries already hide
soft-deleted rows, so the row disappears from every UI without any read-path change, while
historical FKs (`employee.position_id` on a resigned employee, an audit `before` payload)
stay resolvable.

Before writing, the service counts live referents in the same transaction:

- department → live child departments **or** live positions ⇒ `StateConflictError` (409)
- position → live employees with that `position_id` ⇒ `StateConflictError` (409)

This mirrors `deleteRole`'s "409 if users still bound" precedent and keeps the operator in
control of the fix-up. Cascading was rejected: soft-deleting a department out from under a
dozen positions is silent data loss from the operator's point of view, and nulling a live
employee's `position_id` destroys information the delete never asked to touch.

"Live" means `deleted_at IS NULL` on the referent; a soft-deleted position does not keep its
department alive. Employees have no `deleted_at` in practice — a departed employee is
`status = RESIGNED` — so a resigned employee still blocks a position delete. That is
deliberate: the assignment is history, and the position is what makes it readable.

### D3 — Cycle guards walk the parent chain in the write transaction

Both `parent_id` on `department` and `manager_employee_id` on `reporting_line` are
self-referential and both can be pointed into their own subtree.

The guard walks *upward* from the proposed new parent/manager following `parent_id` /
`manager_employee_id`, and fails with `BusinessRuleError` if it reaches the row being edited
(self-reference is the depth-0 case of the same walk). A defensive hop limit (256) turns any
pre-existing cycle in the data into an error instead of an infinite loop.

Walking up is O(depth) with depth bounded by a real org chart, runs on `currentExecutor(db)`
so it joins the caller's transaction, and needs no recursive CTE or raw SQL — the alternative
(`WITH RECURSIVE`) buys nothing at this size and is harder to unit-test.

### D4 — Moving a position keeps its employees

`PUT /positions/{id}` with a new `department_id` moves the position row; employees keep
pointing at the same position id and follow it into the new department. This is the whole
point of `position_id` being a FK to a mutable row, and it is the reason a "move" endpoint is
worth more than delete-and-recreate: recreating would strand every assignment.

### D5 — Reporting line is one upsert, and reads both directions

`GET /employees/{id}/reporting-line` returns
`{ manager: EmployeeRef | null, direct_reports: EmployeeRef[] }` where `EmployeeRef` is
`{ id, emp_code, first_name, last_name }` — the minimum the tab renders, and deliberately
*not* the full `Employee` (which carries salary/PII the endpoint would then have to gate).
Direct reports come from the same table read in reverse; the tab needs both and two round
trips would be wasteful.

`PUT` upserts on the `employee_id` primary key (`onConflictDoUpdate`), so setting a manager
for the first time and changing one are the same call. `manager_employee_id: null` stores an
explicit null row rather than deleting it, keeping the write path single-shaped.

### D6 — Audit rows for org mutations

`AuditService.record` is called inside the mutation's transaction (it uses
`currentExecutor`, so it is atomic with the write) with `entityType: "department" |
"position" | "reporting_line"`, action `UPDATE`/`DELETE`, and `before`/`after` snapshots.

The HR module writes no audit rows today, so this is a new precedent inside `hr` rather than
a new mechanism — the M0 seam, the `audit_append_only` trigger, and the audit-log viewer all
already exist. Creates stay unaudited for now (they are additive and already visible in the
list); the destructive and structural edits are the ones worth reconstructing later.

### D7 — Web: reuse the create drawers as create-or-edit

`org-structure.tsx` already has a department drawer and a position drawer. Both take an
optional `editing: Department | Position | null` prop: when set, fields seed from it, the
title and submit label switch, and submit dispatches the update mutation instead of create.
A second pair of edit-only drawers would duplicate the field layout and its validation for no
gain.

Delete uses `@erp/ui`'s `ConfirmDialog` with the consequence spelled out ("Positions in this
department must be moved first"), and renders a 409's `message` inline in the dialog so the
operator learns *why* it was refused without losing the dialog.

## Risks / Trade-offs

- **Last-write-wins renames (D1)** — two admins editing one department concurrently, the
  later save wins silently. Accepted: low-contention reference data, trivially re-applied,
  and audit rows (D6) make the overwrite reconstructable.
- **A resigned employee blocks a position delete (D2)** — the operator must accept the
  position stays. Mitigated by the 409 message naming the blocking count, and by the fact
  that a soft-deleted position is only hidden, never referentially broken.
- **Deep chains** — the upward walk is one query per level. Org depth is small; the hop limit
  bounds the pathological case.
- **New audit volume** — org edits are rare; negligible against payroll and sales.

## Open Questions

- Should `GET /departments` gain an `include_deleted` flag so an admin can see what was
  removed? Deferred — the audit log answers it today.
- Should deleting a department offer "move its positions to …" as a follow-up action in the
  UI? Out of scope here; the 409 tells the operator what to do first.
