## ADDED Requirements

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
