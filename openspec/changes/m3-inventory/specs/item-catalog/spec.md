## ADDED Requirements

### Requirement: Item master with auto-issued code
The system SHALL create items via `POST /api/v1/items` `{ name, item_type, base_uom_id,
costing_method, min_stock?, attributes }` (perm `inventory.product.create`), issuing a unique
`code` via SequenceService (`ITEM` key, rendered `AA00001`). `item_type` is
`RAW | FINISHED | CONSUMABLE`; `costing_method` is `MAV | FIFO | STANDARD` (default `MAV`).

#### Scenario: Create issues a padded item code
- **WHEN** a user with `inventory.product.create` creates an item
- **THEN** the item is persisted with a unique `code` rendered as `AA` + a 5-digit zero-padded sequence (e.g. `AA00001`)
- **AND** its `costing_method` defaults to `MAV` when not supplied

### Requirement: SKUs and barcodes
The system SHALL create SKUs via `POST /api/v1/items/{id}/skus` `{ variant, barcode? }`,
issuing a unique `sku_code`. A `barcode`, when supplied, MUST be unique across SKUs.

#### Scenario: Create a SKU with a unique barcode
- **WHEN** a SKU is created for an item with a barcode not used by any other SKU
- **THEN** the SKU is stored with its variant and barcode

#### Scenario: Duplicate barcode is rejected
- **WHEN** a SKU is created with a barcode already used by another SKU
- **THEN** the request is rejected with 409 STATE_CONFLICT

### Requirement: Units of measure and conversions
The system SHALL manage `uom` and `uom_conversion` via `POST /api/v1/uom-conversions`
`{ item_id, from_uom, to_uom, factor }`, where `1 from_uom = factor × to_uom`. Conversions
are the basis for converting all quantities to an item's base UOM before ledger writes.

#### Scenario: Register a conversion factor
- **WHEN** a conversion is registered for an item from one UOM to another with a factor
- **THEN** the `uom_conversion` row is stored keyed on `(item, from_uom, to_uom)`

### Requirement: Barcode label printing
The system SHALL accept `POST /api/v1/barcodes/print` `{ sku_ids[] | lot_ids[] }` (perm
`inventory.product.create`) that returns 202 `{ job_id }` and asynchronously renders a label
PDF (barcodes rendered from the SKU/lot barcodes) stored via object storage.

#### Scenario: Print request returns a job id
- **WHEN** a barcode-print request is submitted for one or more SKUs or lots
- **THEN** the response is 202 with a `job_id` and a label PDF is generated asynchronously
