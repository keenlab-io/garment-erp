# Permission Import

## Purpose
Excel import of roles and their permission codes, validated and applied all-or-nothing.

## Requirements

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

### Requirement: Excel import with validation review
The import screen SHALL accept an Excel upload and present a validation-review table marking
each row valid (success) or invalid (danger + reason), with a primary action to import only the
valid rows and an alternative to fix and re-upload — never a silent all-or-nothing failure.

#### Scenario: Partial import of valid rows
- **WHEN** an uploaded file has both valid and invalid rows
- **THEN** the table shows valid rows and invalid rows with reasons, and the user can import the N valid rows

#### Scenario: Invalid rows are explained
- **WHEN** a row fails validation
- **THEN** it is flagged with the reason it cannot be imported
