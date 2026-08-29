## ADDED Requirements

### Requirement: Document template designer
The template editor SHALL expose logo, signature, and stamp asset slots and an Excel named-range
map, gated by the sales permissions; template changes are reflected in the document preview.

#### Scenario: Configure template assets
- **WHEN** logo/signature/stamp assets are set in the template designer
- **THEN** the document preview reflects them

#### Scenario: Map Excel named ranges
- **WHEN** named ranges are mapped in the template
- **THEN** the mapping is stored for the Excel export
