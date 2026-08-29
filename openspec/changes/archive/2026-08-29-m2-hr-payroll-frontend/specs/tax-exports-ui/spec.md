## ADDED Requirements

### Requirement: Tax exports as async jobs
The system SHALL offer PND.1 and SSO exports that run as asynchronous jobs — requesting one shows
a job toast, and completion surfaces a notification with the downloadable file.

#### Scenario: Export runs asynchronously
- **WHEN** a PND.1 or SSO export is requested
- **THEN** a job toast appears immediately and a completion notification provides the file to download
