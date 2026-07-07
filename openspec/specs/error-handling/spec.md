# Error Handling

## Purpose
A uniform { code, message, details } error envelope from a central exception filter that maps typed AppException subclasses, Zod validation errors, and Postgres violations to the right HTTP status.

## Requirements

### Requirement: Uniform error envelope
Every failure response returned by the API MUST have the shape `{ code, message, details }`, where `details` is an array of `{ field?, issue }` objects (empty when no field-level detail applies). This envelope SHALL be emitted for all failure sources — thrown `AppException` subclasses, framework `HttpException`s, Zod validation errors, database errors, and unknown errors alike.

#### Scenario: Application exception produces the envelope
- **WHEN** a request handler throws an `AppException` subclass
- **THEN** the response body is `{ code, message, details }` with the exception's code, message, and details array

#### Scenario: Framework HttpException produces the envelope
- **WHEN** a NestJS `HttpException` is thrown outside application code (e.g. by a framework guard)
- **THEN** the response preserves the exception's HTTP status and the body is the `{ code, message, details }` envelope, not the framework's default shape

#### Scenario: Unknown error produces the envelope
- **WHEN** an unexpected non-HTTP error (e.g. a TypeError) escapes a handler
- **THEN** the response body is still the `{ code, message, details }` envelope

### Requirement: Shared ErrorCode enum
The `code` field of every error response MUST be one of a fixed `ErrorCode` set defined in `@erp/contracts`: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `STATE_CONFLICT`, `BUSINESS_RULE`, `REAUTH_REQUIRED`, `IDEMPOTENT_REPLAY`, `INTERNAL`. The same enum SHALL be importable by both `apps/api` and `apps/web`.

#### Scenario: Error code is from the fixed set
- **WHEN** any API failure response is produced
- **THEN** its `code` value is one of the nine `ErrorCode` members and `isErrorCode(code)` returns true

#### Scenario: Web and api share one definition
- **WHEN** `apps/web` narrows an error response by its `code`
- **THEN** it uses the same `ErrorCode` type exported from `@erp/contracts` that the api filter uses, so an added or renamed code is a compile error in both apps

### Requirement: Central exception filter maps AppException subclasses to HTTP statuses
A single globally-registered exception filter SHALL map each `AppException` subclass to its HTTP status: `ValidationError` → 400, `UnauthenticatedError` → 401, `ForbiddenError` → 403, `NotFoundError` → 404, `StateConflictError` → 409, `BusinessRuleError` → 422, and `ReauthRequiredError` → its dedicated status with code `REAUTH_REQUIRED`. Endpoint handlers MUST NOT construct error response bodies themselves.

#### Scenario: NotFoundError maps to 404
- **WHEN** a handler throws `NotFoundError`
- **THEN** the response has HTTP status 404 and body code `NOT_FOUND`

#### Scenario: BusinessRuleError maps to 422
- **WHEN** a handler throws `BusinessRuleError`
- **THEN** the response has HTTP status 422 and body code `BUSINESS_RULE`

#### Scenario: StateConflictError maps to 409
- **WHEN** a handler throws `StateConflictError`
- **THEN** the response has HTTP status 409 and body code `STATE_CONFLICT`

### Requirement: Zod validation errors map to 400 with per-field details
When request validation fails with a Zod error, the filter SHALL return HTTP 400 with code `VALIDATION_ERROR` and a `details` array containing one `{ field, issue }` entry per failed field, where `field` identifies the offending path.

#### Scenario: Invalid request body
- **WHEN** a request body fails Zod schema validation on two fields
- **THEN** the response is 400 with code `VALIDATION_ERROR` and `details` contains two entries, each with the failing field path and its issue message

### Requirement: Postgres unique violations map to 409 STATE_CONFLICT
When a database write fails with a Postgres unique-constraint violation (SQLSTATE 23505), the filter SHALL return HTTP 409 with code `STATE_CONFLICT` rather than a 500.

#### Scenario: Duplicate key insert
- **WHEN** an insert violates a unique constraint and the driver raises error code 23505
- **THEN** the response is 409 with body code `STATE_CONFLICT`

### Requirement: Unknown errors return scrubbed 500 INTERNAL and are logged
Any error not matched by the mappings above SHALL produce HTTP 500 with code `INTERNAL`. The original error (message and stack) MUST be logged server-side, and the client-facing `message` MUST NOT contain the original error message or stack.

#### Scenario: Unexpected error is scrubbed
- **WHEN** a handler throws `new Error("db password is hunter2")`
- **THEN** the response is 500 with code `INTERNAL`, the response message is a generic string not containing "hunter2", and the original error is written to the server log
