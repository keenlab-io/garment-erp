# Document Sequencing

## Purpose
Race-safe generation of unique, monotonic, formatted document numbers per key, with optional yearly reset.

## Requirements

### Requirement: Unique monotonic document numbers per key
The system SHALL provide a sequence service whose `next(key)` returns a formatted document number for the given sequence key. Within a key (and, when yearly reset is enabled, within a year scope), successive calls MUST return strictly increasing sequence values with no duplicates. Each call SHALL persist the incremented `current_value` in the key's `document_sequence` row within a transaction, so a number is never handed out twice.

#### Scenario: Sequential numbers for one key
- **WHEN** `next("SO")` is called three times in succession
- **THEN** the returned numbers carry sequence values n, n+1, n+2 with no gaps or repeats among the returned values

#### Scenario: Independent keys do not interfere
- **WHEN** `next("SO")` and `next("PO")` are each called
- **THEN** each key increments its own `current_value` and neither call affects the other key's sequence

### Requirement: Race safety under concurrency
`next(key)` MUST be safe under concurrent callers: it SHALL run inside a database transaction and lock the single `document_sequence` row for the key with `SELECT ... FOR UPDATE` before reading and incrementing `current_value`, so concurrent transactions serialize on the row and can never observe the same value.

#### Scenario: Zero duplicates under concurrent load
- **WHEN** 50 callers invoke `next("SO")` concurrently
- **THEN** all 50 calls succeed and the 50 returned document numbers are all distinct

#### Scenario: Row lock serializes concurrent increments
- **WHEN** two transactions call `next("SO")` at the same time
- **THEN** the second transaction waits for the first's row lock to release and reads the already-incremented `current_value`

### Requirement: Format rendering
The service SHALL render the key's configured `format` string into the returned document number, substituting:
- `{prefix}` with the row's prefix,
- `{yyyy}` with the current year of the sequence's year scope,
- `{seq:0000}` with the sequence value zero-padded to the literal pad width given in the token,
- bare `{seq}` with the sequence value zero-padded to the row's configured `padding`.

#### Scenario: Standard formatted number
- **WHEN** a sequence with prefix `SO`, format `{prefix}-{yyyy}-{seq:0000}`, and current year scope 2026 issues its first value
- **THEN** the returned number is `SO-2026-0001`

#### Scenario: Bare seq token uses configured padding
- **WHEN** a sequence row has `padding = 6`, format `{prefix}{seq}`, prefix `INV`, and the next value is 42
- **THEN** the returned number is `INV000042`

### Requirement: Optional yearly reset
When a sequence is configured with `resetYearly` and `next(key)` observes that the current year differs from the row's `year_scope`, it SHALL reset `current_value` to 1 and advance `year_scope` to the current year within the same locked transaction; the returned number uses the new year and sequence 1. When `resetYearly` is not set, or the year has not changed, `next(key)` SHALL simply increment `current_value`.

#### Scenario: First call of a new year resets the counter
- **WHEN** a `resetYearly` sequence has `year_scope = 2025`, `current_value = 371`, and `next(key)` is called in 2026
- **THEN** the row becomes `year_scope = 2026`, `current_value = 1`, and the returned number renders year 2026 with sequence 1

#### Scenario: Non-resetting sequence spans years
- **WHEN** a sequence without `resetYearly` is called after the calendar year changes
- **THEN** `current_value` continues incrementing from its previous value without resetting

### Requirement: Single row per key
The `document_sequence` table SHALL hold exactly one row per sequence key, enforced by the `unique(key, year_scope)` constraint together with in-place rollover: a yearly reset MUST update the existing row's `year_scope` rather than inserting a new row, so `SELECT ... WHERE key = $1` always returns exactly one row.

#### Scenario: Rollover does not create a second row
- **WHEN** a `resetYearly` sequence rolls over from 2025 to 2026
- **THEN** the table still contains exactly one row for that key, now with `year_scope = 2026`

#### Scenario: Lookup by key is unambiguous
- **WHEN** the service selects the `document_sequence` row by key alone
- **THEN** exactly one row is returned regardless of how many yearly rollovers have occurred
