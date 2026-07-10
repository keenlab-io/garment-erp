## ADDED Requirements

### Requirement: Gantt timeline command center
The production timeline SHALL render work orders as rows and steps as status-colored bars using
the production `InkChip` set (color + dot shape + label, legible without color), with an alert
rail listing delayed steps and overdue SLAs. Clicking a bar opens a step drawer (assigned worker,
machine, elapsed vs standard, defects) offering reassign, hold, and subcontract.

#### Scenario: Steps are identifiable without color
- **WHEN** the timeline is viewed
- **THEN** each step's status is conveyed by shape and label as well as color, readable across a room

#### Scenario: Delayed steps surface in the alert rail
- **WHEN** a step crosses its standard time
- **THEN** it is flagged delayed and appears in the alert rail, not by color change alone

### Requirement: Live timeline updates
Floor scans SHALL update the timeline in near-real-time via the realtime gateway, animating in
softly; the mobile timeline is read-only.

#### Scenario: A floor scan updates the lead's timeline
- **WHEN** an operator scans a step start/finish on the floor
- **THEN** the lead's timeline bar updates within seconds with a soft animation
