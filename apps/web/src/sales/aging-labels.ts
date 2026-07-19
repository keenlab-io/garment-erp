import type { AgingBucketKey } from "./components/aging-bucket-chip.js";

/** The `sales` i18next key for each aging bucket — shared by the aging dashboard and the
 * customer detail screen's aging summary (M5 §4.4/§4.5). */
export const AGING_BUCKET_LABEL_KEY = {
  current: "aging.bucketCurrent",
  d1_30: "aging.bucket1To30",
  d31_60: "aging.bucket31To60",
  d61_90: "aging.bucket61To90",
  over_90: "aging.bucketOver90",
} as const satisfies Record<AgingBucketKey, string>;
