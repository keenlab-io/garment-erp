## ADDED Requirements

### Requirement: Excel import of roles and their permission codes
The system SHALL expose `POST /api/v1/iam/import` accepting a multipart Excel upload
(perm `iam.role.manage`). Each row represents a role: a role name plus its permission
codes. The importer MUST parse the workbook, validate **every** referenced permission code
against `permission.code`, and — on success — create or update the named roles and replace
their `role_permission` rows. The response MUST be `{ imported, skipped[] }`.

#### Scenario: Import creates and updates roles
- **WHEN** a valid workbook with rows mapping role names to known permission codes is uploaded
- **THEN** each named role is created (or updated with its new permission set)
- **AND** the response reports the count of `imported` roles

### Requirement: Import is all-or-nothing
The import SHALL run inside a single transaction. If **any** row references an unknown
permission code, the entire import MUST fail with 400 VALIDATION_ERROR whose `details[]`
identifies the offending rows/codes, and **no** role or `role_permission` change is
persisted.

#### Scenario: Unknown code aborts the whole import
- **WHEN** an uploaded workbook contains at least one permission code absent from the catalog
- **THEN** the request is rejected with 400 VALIDATION_ERROR listing the offending rows
- **AND** no role from the file is created or modified (the transaction rolls back)

#### Scenario: Affected users are revoked on a successful import
- **WHEN** an import changes the permission set of a role that has bound users
- **THEN** those users' `permissions_version` values are incremented in the same transaction
