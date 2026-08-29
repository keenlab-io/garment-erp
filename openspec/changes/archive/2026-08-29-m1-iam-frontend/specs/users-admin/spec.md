## ADDED Requirements

### Requirement: Users list and detail
The system SHALL provide a users list (Data Table) and a user detail view with roles, active
sessions, and activity, gated by `iam.user.manage`. Creating and editing a user use a drawer
with an optional employee link and role assignment.

#### Scenario: Manage users
- **WHEN** a user with `iam.user.manage` opens the users list
- **THEN** users are shown in a Data Table, and opening a user shows their roles, sessions, and activity

### Requirement: Force-logout and session revoke
The user detail SHALL offer force-logout and per-session revoke through the guarded
`ConfirmDialog` (consequence + Super-Admin re-auth); after force-logout the user's sessions
render as struck-through.

#### Scenario: Force-logout is guarded and reflected
- **WHEN** a Super-Admin force-logs-out a user via the confirm dialog with re-auth
- **THEN** the user's sessions are shown struck-through and a toast confirms the action
