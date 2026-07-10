## ADDED Requirements

### Requirement: Effective-dated payroll parameters
The system SHALL store payroll parameters in effective-dated, admin-editable configuration:
progressive tax brackets, the social-security rate and wage ceiling, OT rate multipliers per
`rate_type`, and the cash-advance ceiling policy. The payroll engine MUST resolve the
**current-effective** parameter values at calculation time and snapshot the resolved values
into the payslip breakdown.

#### Scenario: Engine uses current-effective parameters
- **WHEN** payroll is calculated for a period
- **THEN** the engine reads the parameter rows whose effective date is current for that period
- **AND** the resolved rates/ceilings are recorded in the payslip breakdown

#### Scenario: A future parameter change does not affect a prior run
- **WHEN** a parameter's new value takes effect after a run was already calculated
- **THEN** the already-calculated run's snapshot is unchanged

### Requirement: Parameters are non-authoritative
Tax and social-security parameters SHALL be flagged as non-authoritative, indicating they
require accountant confirmation and are not a substitute for statutory computation.

#### Scenario: Parameters carry a non-authoritative flag
- **WHEN** payroll parameters are read or exported
- **THEN** they are marked non-authoritative (subject to accountant confirmation)
