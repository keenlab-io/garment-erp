## ADDED Requirements

### Requirement: Filtered, paginated audit query API
The system SHALL expose `GET /api/v1/audit` (perm `iam.audit.view`) that reads the M0
append-only `audit_log`. It MUST support filtering by `entity_type`, `entity_id`, `actor`
(actor user id), and a `from`/`to` time range, and MUST return results with cursor
pagination in the standard `{ data, next_cursor }` shape, newest first. The endpoint is
read-only; it MUST NOT expose any mutation of `audit_log`.

#### Scenario: Query by entity
- **WHEN** a user with `iam.audit.view` calls `GET /audit?entity_type=role&entity_id=<id>`
- **THEN** the response returns the audit rows for that entity in `{ data, next_cursor }` form, newest first

#### Scenario: Query by actor and time range
- **WHEN** the request filters by `actor` and a `from`/`to` window
- **THEN** only audit rows by that actor within the window are returned, paginated

#### Scenario: Audit query requires the permission
- **WHEN** a user lacking `iam.audit.view` calls `GET /audit`
- **THEN** the request is rejected with 403 FORBIDDEN

#### Scenario: Read-only over an append-only log
- **WHEN** the audit query API is used
- **THEN** it offers only read access and no endpoint mutates `audit_log`
