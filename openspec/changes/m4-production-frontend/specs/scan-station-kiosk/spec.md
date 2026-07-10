## ADDED Requirements

### Requirement: Two-action kiosk scan station
The scan station SHALL lock to Touch density with no navigation, menus, or free text: an
auto-focused scan field reads a routing card, shows the work-order card (customer, item, qty,
current step, mockup, elapsed), and exposes exactly two giant buttons **START** and **FINISH**
with only the state-valid one enabled; a tap confirms and returns to the scan field. The card's
status edge color reflects the step state.

#### Scenario: Kiosk exposes exactly two primary actions
- **WHEN** a routing card is scanned at the kiosk
- **THEN** the work-order card appears with two large buttons, only the valid one enabled, tappable with gloves

#### Scenario: Defect reporting via tiles
- **WHEN** the operator reports a defect
- **THEN** a large tile picker selects the defect type and a stepper sets the quantity, with no free text

### Requirement: Offline scan queue
When offline, the kiosk SHALL show an offline banner and a queued-scan count, store scans locally,
and sync them on reconnect (idempotently), so the operator keeps working.

#### Scenario: Scans queue offline and sync on reconnect
- **WHEN** the kiosk loses connectivity and the operator keeps scanning
- **THEN** scans are queued locally with a visible count and synced on reconnect without double-posting
