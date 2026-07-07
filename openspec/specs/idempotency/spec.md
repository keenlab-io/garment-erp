# Idempotency

## Purpose
At-most-once mutations via an Idempotency-Key header: first use persists the response, exact replays return it without re-executing, and key reuse with a different payload is rejected.

## Requirements

### Requirement: Idempotency-Key header on mutating requests
The API SHALL accept an optional `Idempotency-Key` header on mutating requests (POST/PUT/PATCH/DELETE). Keys MUST be scoped per user: the stored record is keyed by `(key, user_id)`, so two different users using the same key value do not interfere. Requests without the header SHALL execute normally with no idempotency behavior.

#### Scenario: Request without a key executes normally
- **WHEN** a mutating request is sent without an `Idempotency-Key` header
- **THEN** the request executes normally and no idempotency record is stored

#### Scenario: Same key from different users is independent
- **WHEN** user A and user B each send a mutating request with the identical `Idempotency-Key` value
- **THEN** both requests execute their side effects, each stored under its own `(key, user_id)` record

### Requirement: First use persists the response
On the first use of an idempotency key, the request SHALL execute normally, and the system MUST persist a record containing a hash of the request, the response HTTP status, and the response body, keyed by `(key, user_id)`.

#### Scenario: First request is executed and recorded
- **WHEN** a mutating request carries an `Idempotency-Key` not previously seen for that user
- **THEN** the handler executes its side effect, the response is returned to the client, and an idempotency record with the request hash, response status, and response body is stored

### Requirement: Replay returns the stored response without re-executing
When a request arrives with an idempotency key that already has a stored record for that user and the request hash matches the stored hash, the system MUST return the stored response (same status and body) without executing the handler's side effect again, and MUST mark the response as an idempotent replay using `IDEMPOTENT_REPLAY`.

#### Scenario: Exact replay is not re-executed
- **WHEN** a client repeats a mutating request with the same `Idempotency-Key` and byte-identical payload after the original succeeded
- **THEN** the stored status and body are returned, the underlying side effect (e.g. row insert) does not occur a second time, and the response is marked as an `IDEMPOTENT_REPLAY`

### Requirement: Key reuse with a different payload is rejected
If a request arrives with an idempotency key that has a stored record for that user but the request hash differs from the stored hash, the system MUST reject the request as a conflict and MUST NOT execute the handler.

#### Scenario: Same key, different body
- **WHEN** a client sends a mutating request reusing a prior `Idempotency-Key` but with a different request payload
- **THEN** the request is rejected with a 409 conflict error response, and no side effect is executed

### Requirement: Idempotency records expire
Every stored idempotency record MUST carry an expiry timestamp (`expiresAt`). A key whose record has expired SHALL be treated as a first use again.

#### Scenario: Expired key behaves as first use
- **WHEN** a client reuses an `Idempotency-Key` whose stored record's `expiresAt` is in the past
- **THEN** the request executes normally as a first use and a fresh record with a new expiry is stored
