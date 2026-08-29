## ADDED Requirements

### Requirement: Permission matrix editor
The role editor SHALL render a module×action **permission matrix** built from the
`@erp/contracts` `PERMISSIONS` catalog (rows = `module.resource`, columns = actions, cells =
checkboxes), with collapsible group headers. Salary/cost permission groups
(`hr.salary.*`, `inventory.cost.*`) SHALL be visually separated and captioned below the grid.

#### Scenario: Matrix reflects the real permission catalog
- **WHEN** the role editor opens for a role
- **THEN** the matrix rows/columns are derived from the permission catalog and the role's current grants are checked

#### Scenario: Salary/cost group is separated and captioned
- **WHEN** the matrix is displayed
- **THEN** salary/cost permissions appear as distinct captioned toggles separated from the main grid

### Requirement: Save surfaces the affected-user blast radius
Editing the matrix SHALL show a **live "affects N users" count**, and saving SHALL open a
confirmation stating that N active users will be force re-authenticated. Removing the last
permission of a system role MUST be blocked inline.

#### Scenario: Affected-user count is shown before commit
- **WHEN** a permission cell is toggled
- **THEN** the "affects N users" count updates, and Save requires confirming that N users will be re-authenticated

#### Scenario: A system role cannot be emptied
- **WHEN** the last permission of a system role is removed
- **THEN** the change is blocked inline with an explanation

### Requirement: Guarded role delete with reassignment
Deleting a role bound to users SHALL surface the backend 409 as an inline blocker linking to the
affected users (reassign first) — never a dead-end. An unbound role deletes through the re-auth
confirm dialog.

#### Scenario: Deleting a bound role is blocked with a path forward
- **WHEN** a Super-Admin attempts to delete a role still bound to users
- **THEN** an inline message states how many users use it and links to reassign them, and the delete is blocked

#### Scenario: Deleting an unbound role requires re-auth
- **WHEN** an unbound role is deleted
- **THEN** a confirm dialog captures the Super-Admin password and states the consequence before deleting
