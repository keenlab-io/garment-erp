# i18n-localization

## ADDED Requirements

### Requirement: Thai-first bilingual UI with a persisted toggle
The UI SHALL ship Thai (`th`) as the default locale and English (`en`) as a complete alternative, switchable at runtime from the top bar's TH/EN toggle without a reload. The choice persists across sessions, and the document's `lang` attribute always reflects the active locale.

#### Scenario: Default is Thai
- **WHEN** a user with no stored language preference opens the app
- **THEN** the UI renders in Thai and `<html lang>` is `th`

#### Scenario: Toggle switches live and persists
- **WHEN** the user switches to EN and later reloads
- **THEN** all visible strings switch to English without a page reload, and the app restores English on the next visit

### Requirement: No hardcoded user-facing strings
All user-facing strings in `@erp/ui` and `apps/web` SHALL resolve through the i18n layer with typed message keys; a key missing from either locale is surfaced as a build/CI failure, not a silent fallback in production screens. Technical identifiers (permission codes, document numbers, SKUs) are exempt and render as-is.

#### Scenario: Missing translation fails CI
- **WHEN** a message key exists in the `th` resources but not in `en`
- **THEN** the translation-completeness check fails the pipeline, identifying the missing key

#### Scenario: Foundation components are translatable
- **WHEN** the locale is switched
- **THEN** built-in strings of foundation components (empty states, bulk bar counts, confirm buttons, pagination) switch language along with app strings

### Requirement: Layout tolerates bilingual expansion
Layouts SHALL tolerate approximately 30% text expansion when switching between Thai and English: no clipped, truncated-without-affordance, or overlapping text on foundation surfaces (nav, buttons, table headers, dialogs, form labels) in either locale, at any density.

#### Scenario: Toggle causes no clipping
- **WHEN** the locale toggles on a screen showing the shell, a table, and a dialog
- **THEN** all labels remain fully legible (wrapping or ellipsis-with-tooltip where designed), with no overlapping elements in either language

### Requirement: Thai typesetting rules
Thai text SHALL be typeset per the locked rules: body line-height ≥1.6 (1.75 for long-form), never `text-align: justify`, never letter-spacing on Thai, word-breaking left to the browser/ICU breaker, and dense table rows sized so Thai ascenders/descenders and tone marks are not clipped (Comfortable rows accommodate Thai at the 14px density font).

#### Scenario: Tone marks are not clipped in tables
- **WHEN** Thai strings with upper vowel and tone marks (e.g. "ใบเสนอราคา", "ที่อยู่") render in table rows at each density
- **THEN** no glyph is visually clipped by the row box in Comfortable or Compact density

### Requirement: Locale-aware formatting with string-safe money
Dates and plain numbers SHALL format via the active locale (`Intl` APIs). Money and quantity values SHALL keep their contract string representation end-to-end and format via `@erp/utils` helpers — locale affects separators/currency display only, never the arithmetic or a float conversion. Digits render as Arabic numerals (0–9) in both locales for data integrity in tables and documents.

#### Scenario: Money format is locale-aware but float-free
- **WHEN** `"53500.00"` renders as THB in Thai locale
- **THEN** it displays with Thai-convention grouping and currency symbol (e.g. ฿53,500.00) produced from string/decimal helpers, with no float conversion of the amount

#### Scenario: Dates follow the locale
- **WHEN** the locale switches from `en` to `th`
- **THEN** displayed dates re-format per the Thai locale convention without a reload
