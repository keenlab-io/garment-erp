## ADDED Requirements

### Requirement: The tax benefit is shown only on declared eligibility — never blindly
Quote computation (`QuoteService` in `apps/api/src/platform/billing/`) SHALL include an
after-tax-benefit section only when ALL of the following hold: the prospect has
explicitly declared `registered_capital_at_most_5m = true` AND
`annual_revenue_at_most_30m = true` (with `declared_by`/`declared_at` captured); the
quote date is on or before **2027-12-31** (the decree's sunset); and the vendor's depa
Thailand Digital Catalog registration flag is enabled in config. When any condition
fails the benefit section MUST be entirely absent — not zeroed, not struck through —
because the GTM document itself warns that factories above the ฿30M revenue ceiling get
nothing from the decree, and showing them a benefit they cannot claim destroys the
quote's credibility at the accountant's desk.

#### Scenario: Medium factory sees list price only
- **WHEN** a quote is computed with `annual_revenue_at_most_30m = false`
- **THEN** the output contains the list price and no tax-benefit figures anywhere

#### Scenario: The sunset is enforced
- **WHEN** a quote is computed dated 2028-01-01 for a fully eligible prospect
- **THEN** no benefit section is produced

#### Scenario: Eligibility defaults to undeclared
- **WHEN** a quote is computed without an eligibility block
- **THEN** it is treated as ineligible and shows list price only

### Requirement: The benefit math respects the ฿300,000 annual cap
For an eligible quote, qualifying spend SHALL be `min(first-year total, ฿300,000)`;
the illustrated extra deduction equals the qualifying spend; the estimated saving is
presented as a **range** over the SME corporate-tax band (≈15–20%, sourced from
versioned config, not code literals — the sunset date likewise); and the effective
price is the total minus that range. Spend above ฿300,000 in a year MUST be shown at
list with an explicit note that it does not qualify. All arithmetic uses `@erp/utils`
decimal helpers on money strings.

#### Scenario: The GTM's own worked example reproduces
- **WHEN** an eligible quote totals ฿280,000 for the first year
- **THEN** the illustrated saving is the ฿42,000–56,000 range and the effective price ฿224,000–238,000

#### Scenario: Over-cap spend is split honestly
- **WHEN** an eligible quote totals ฿400,000 for the first year
- **THEN** the benefit is computed on ฿300,000 only and the remaining ฿100,000 is marked as not qualifying

### Requirement: Every benefit-bearing output carries the accountant caveat
Every quote output that shows tax-benefit figures — API response and PDF alike — SHALL
embed the GTM document's caveat substantially verbatim: the figures are illustrative,
every business's tax position is different, and the customer's accountant must confirm
the actual saving and the business's eligibility before relying on them. The caveat is
not omittable by any parameter.

#### Scenario: The caveat cannot be turned off
- **WHEN** any eligible quote PDF is generated, by any admin, with any options
- **THEN** the caveat block is present adjacent to the benefit figures
