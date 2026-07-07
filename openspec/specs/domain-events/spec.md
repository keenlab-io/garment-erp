# Domain Events

## Purpose
A standard DomainEvent envelope with in-transaction (atomic) and after-commit dispatch, a transaction-scoped handler context, and wildcard subscription.

## Requirements

### Requirement: Standard DomainEvent envelope
The system SHALL represent every domain event as a standard envelope containing `event` (namespaced name), `version`, `occurred_at`, `actor_user_id`, `payload`, and `correlation_id`. When an event is created inside an active transaction and no `correlation_id` is supplied, the envelope's `correlation_id` MUST default to the current transaction's correlation id.

#### Scenario: Envelope carries all standard fields
- **WHEN** a publisher creates a domain event with an event name, payload, and actor
- **THEN** the resulting envelope contains `event`, `version`, `occurred_at`, `actor_user_id`, `payload`, and `correlation_id`

#### Scenario: Correlation id defaults from the active transaction
- **WHEN** a domain event is created inside a unit-of-work transaction without an explicit `correlation_id`
- **THEN** the envelope's `correlation_id` equals the correlation id of that transaction
- **AND** a second event created in the same transaction carries the same `correlation_id`

### Requirement: In-transaction dispatch is atomic with the originating mutation
The event bus SHALL provide an in-transaction publish operation that dispatches the event to all matching handlers synchronously and awaits their completion inside the same database transaction as the originating mutation. If any in-transaction handler throws, the entire transaction — including the originating mutation — MUST roll back.

#### Scenario: Handlers complete before the transaction commits
- **WHEN** a mutation publishes an event via in-transaction dispatch inside a transaction
- **THEN** all subscribed handlers have run to completion before the transaction commits

#### Scenario: Throwing handler rolls back the mutation
- **WHEN** an in-transaction handler throws an error during dispatch
- **THEN** the database transaction is rolled back
- **AND** neither the originating mutation nor any handler-side writes (e.g. an audit row) are persisted

### Requirement: After-commit dispatch never observes uncommitted state
The event bus SHALL provide an after-commit publish operation that defers handler execution until after the enclosing database transaction has committed. After-commit handlers MUST NOT run if the transaction rolls back, and MUST only ever read committed data.

#### Scenario: Handler runs only after commit
- **WHEN** an event is published via after-commit dispatch inside a transaction
- **THEN** the handler does not execute before the transaction commits
- **AND** the handler executes after the commit and can read the committed data

#### Scenario: Rolled-back transaction suppresses after-commit handlers
- **WHEN** a transaction publishes an event via after-commit dispatch and then rolls back
- **THEN** the after-commit handler is never invoked

#### Scenario: After-commit publish outside a transaction
- **WHEN** an event is published via after-commit dispatch with no active transaction
- **THEN** the handler is dispatched immediately

### Requirement: Transaction-scoped handler context
In-transaction event handlers SHALL automatically execute against the active database transaction via a transaction context, without the publisher passing the transaction handle through the event payload. Database writes performed by such handlers MUST use the same transaction as the originating mutation.

#### Scenario: Handler write joins the caller's transaction
- **WHEN** an in-transaction handler performs a database write while a transaction is active in the context
- **THEN** the write executes on the active transaction, not a separate connection
- **AND** the write commits or rolls back together with the originating mutation

### Requirement: Wildcard event subscription
The event system SHALL use namespaced event names with `.` as the delimiter and SHALL support wildcard subscriptions so a single handler can receive events across a namespace or all events.

#### Scenario: Global wildcard subscriber receives all events
- **WHEN** a handler subscribes with a global wildcard pattern and an event named `inventory.stock.adjusted` is published
- **THEN** the wildcard handler is invoked with that event's envelope

#### Scenario: Namespace wildcard matches by delimiter
- **WHEN** a handler subscribes to a namespace wildcard pattern (e.g. `inventory.*` semantics with delimiter `.`)
- **THEN** events published under that namespace are delivered to the handler
- **AND** events outside the namespace are not delivered to it
