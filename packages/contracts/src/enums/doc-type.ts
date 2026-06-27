// Document-type codes (spec §1): QV (มูลค่า/valued) vs QNV (ไม่มีมูลค่า/non-valued).
export const DocType = {
  QV: "QV",
  QNV: "QNV",
} as const;
export type DocType = (typeof DocType)[keyof typeof DocType];

// VAT handling mode (spec §5.3): include (VatNai) vs exclude (VatNok).
export const VatMode = {
  VatNai: "VatNai",
  VatNok: "VatNok",
} as const;
export type VatMode = (typeof VatMode)[keyof typeof VatMode];
