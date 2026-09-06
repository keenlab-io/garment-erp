## ADDED Requirements

### Requirement: Org structure rows are editable and removable
The org structure screen SHALL offer Edit and Delete row actions on both the departments and
the positions Data Table, visible only to users with `hr.employee.manage`. Edit MUST reuse the
create drawer seeded with the row's current values (department: name, parent; position: title,
job description, department). Delete MUST require confirmation stating the consequence, and
when the API refuses the delete the reason MUST be shown inline in the confirmation rather
than dismissing it.

#### Scenario: Renaming a department from the list
- **WHEN** a user with `hr.employee.manage` picks Edit on a department row
- **THEN** the drawer opens pre-filled with that department's name and parent
- **AND** saving updates the row in place

#### Scenario: Delete requires confirmation
- **WHEN** a user picks Delete on a position row
- **THEN** a confirmation naming the position is shown before any request is sent

#### Scenario: A refused delete explains itself
- **WHEN** the delete is rejected because the position is still assigned to employees
- **THEN** the confirmation stays open and shows the rejection message

#### Scenario: Read-only users see no row actions
- **WHEN** a user has `hr.employee.view` but not `hr.employee.manage`
- **THEN** neither Edit nor Delete is present in the DOM

### Requirement: Employee reporting tab shows and edits the manager
The employee detail's Reporting tab SHALL show the employee's manager and their direct
reports instead of an empty state. Users with `hr.employee.manage` MUST be able to pick a
manager from a searchable employee picker and to clear it; users with only `hr.employee.view`
see the same information read-only. A rejected assignment (a managerial cycle) MUST surface
its message without changing the displayed manager.

#### Scenario: Manager and direct reports render
- **WHEN** a user with `hr.employee.view` opens the Reporting tab of an employee who has a manager and two reports
- **THEN** the manager and both direct reports are listed by name and employee code

#### Scenario: Assigning a manager
- **WHEN** a user with `hr.employee.manage` picks an employee in the manager field and saves
- **THEN** the reporting line is written and the tab reflects the new manager

#### Scenario: Clearing a manager
- **WHEN** the manager field is cleared and saved
- **THEN** the employee is shown as having no manager

#### Scenario: Employee without a reporting line
- **WHEN** the employee has no manager and no direct reports
- **THEN** the tab shows an empty manager field and an empty reports list, not an "unavailable" message

### Requirement: Employee position is editable from the profile tab
The employee detail's Profile tab SHALL display the employee's position title and, for users
with `hr.employee.manage`, allow reassigning it to another position or clearing it as part of
the profile edit, sent with the same `If-Match`-guarded employee update as the other profile
fields.

#### Scenario: Reassigning a position
- **WHEN** a user with `hr.employee.manage` edits the profile and picks a different position
- **THEN** the employee update carries the new `position_id`

#### Scenario: Clearing a position
- **WHEN** the position is set to "no position"
- **THEN** the employee update carries a null `position_id`
