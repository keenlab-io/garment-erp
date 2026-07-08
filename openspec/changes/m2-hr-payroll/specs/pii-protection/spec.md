## ADDED Requirements

### Requirement: PII encrypted at rest
The system SHALL encrypt sensitive personal data at rest at the service layer using
AES-256-GCM: the national ID is stored in `employee.national_id_enc` (`bytea`) and
sensitive bank/contact fields inside `profile` are stored as ciphertext. Plaintext PII MUST
NOT be persisted, logged, or returned on the wire in cleartext except through an explicit,
authorized decrypt path. The encryption key MUST come from validated configuration
(`ENCRYPTION_KEY`), and boot MUST fail fast if it is missing or the wrong length.

#### Scenario: National ID is stored as ciphertext
- **WHEN** an employee is created with a national ID
- **THEN** `national_id_enc` contains ciphertext (IV + auth tag + ciphertext), not the plaintext
- **AND** the plaintext national ID does not appear in the database row or any log

#### Scenario: Round-trip decryption returns the original value
- **WHEN** the service decrypts a stored `national_id_enc`
- **THEN** it recovers exactly the original national ID

#### Scenario: Boot fails without a valid key
- **WHEN** the API boots without a valid `ENCRYPTION_KEY`
- **THEN** startup aborts before serving requests

### Requirement: Decryption is server-side and audited
Decryption of PII SHALL occur only in the service layer for authorized operations, and each
decrypt of a PII field MUST be recorded in the audit log.

#### Scenario: Authorized decrypt is audited
- **WHEN** an authorized operation decrypts an employee's national ID
- **THEN** an `audit_log` entry recording the access (actor, entity, timestamp) is written

#### Scenario: Ciphertext never crosses the wire in cleartext
- **WHEN** an employee record is returned by any endpoint
- **THEN** the national ID and sensitive bank fields are either omitted or masked, never returned as plaintext unless via an explicit authorized decrypt path
