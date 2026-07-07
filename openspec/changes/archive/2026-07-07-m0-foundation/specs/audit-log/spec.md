## ADDED Requirements

### Requirement: Audit log is append-only at the database level
The `audit_log` table SHALL be append-only. Any UPDATE or DELETE against `audit_log` MUST be rejected by the database itself via a trigger, so that immutability holds even for the table owner and regardless of application code paths.

#### Scenario: UPDATE on an audit row is rejected
- **WHEN** any database session attempts to UPDATE a row in `audit_log`
- **THEN** the database raises an error and the row is unchanged

#### Scenario: DELETE on an audit row is rejected
- **WHEN** any database session attempts to DELETE a row from `audit_log`
- **THEN** the database raises an error and the row remains

#### Scenario: Table owner cannot mutate audit rows
- **WHEN** the table-owner role attempts an UPDATE or DELETE on `audit_log`
- **THEN** the trigger rejects the statement with an error

#### Scenario: INSERT is permitted
- **WHEN** the application inserts a new `audit_log` row
- **THEN** the insert succeeds

### Requirement: Audit entries recorded from domain events in the same transaction
The system SHALL record an `audit_log` entry for any domain event whose payload carries an `audit` block, via a subscriber to all events. The audit write MUST execute within the same database transaction as the originating change, so the audit entry and the change commit or roll back together.

#### Scenario: Event with audit block produces an audit row
- **WHEN** a domain event whose payload includes an `audit` block is published in-transaction
- **THEN** an `audit_log` row is inserted within the same transaction as the originating change
- **AND** both the change and the audit row are visible after commit

#### Scenario: Event without audit block produces no audit row
- **WHEN** a domain event whose payload has no `audit` block is published
- **THEN** no `audit_log` row is inserted

#### Scenario: Rollback removes both the change and its audit entry
- **WHEN** the transaction containing the originating change and the audit write rolls back
- **THEN** neither the change nor the audit entry is persisted

### Requirement: Direct audit recording via the audit service
The system SHALL provide an audit service with a `record` operation that writes an `audit_log` entry directly, without requiring a domain event. When called inside an active transaction, the write MUST join that transaction.

#### Scenario: Service records an entry directly
- **WHEN** application code calls the audit service's `record` with an audit entry
- **THEN** a corresponding `audit_log` row is inserted

#### Scenario: Direct record joins the active transaction
- **WHEN** `record` is called inside a unit-of-work transaction that subsequently rolls back
- **THEN** the audit row is not persisted

### Requirement: Sensitive actions require a non-blank reason
Sensitive actions — including stock adjustment, void, permission change, and payroll approval — MUST supply a non-blank reason for their audit entry. The system SHALL reject a missing, empty, or whitespace-only reason as a business-rule error with HTTP status 422.

#### Scenario: Blank reason is rejected with 422
- **WHEN** a sensitive action (e.g. a stock adjustment) is attempted with a missing, empty, or whitespace-only reason
- **THEN** the request fails with HTTP 422 and error code `BUSINESS_RULE`
- **AND** no change and no audit entry are persisted

#### Scenario: Valid reason is accepted and captured
- **WHEN** a sensitive action is performed with a non-blank reason
- **THEN** the action succeeds
- **AND** the audit entry stores the supplied reason

### Requirement: Audit entries capture actor, action, entity, and timestamp
Each `audit_log` entry SHALL capture who performed the action, what action was performed, which entity was affected, and when it occurred, per the `audit_log` schema.

#### Scenario: Entry fields are populated
- **WHEN** an audit entry is recorded for a change performed by an authenticated user
- **THEN** the stored row identifies the actor, the action, the affected entity, and the timestamp of the action
