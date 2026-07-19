import { InkChip, type ChipStatus } from "@erp/ui";

export type AgingBucketKey = "current" | "d1_30" | "d31_60" | "d61_90" | "over_90";

const BUCKET_TO_CHIP: Record<AgingBucketKey, ChipStatus> = {
  current: "aging-current",
  d1_30: "aging-1-30",
  d31_60: "aging-31-60",
  d61_90: "aging-61-90",
  over_90: "aging-90-plus",
};

/**
 * Bucket a signed day count against a due date into the credit-terms aging buckets used by the
 * `sales.reports.aging` contract (`current`/`d1_30`/`d31_60`/`d61_90`/`over_90`) — not yet overdue
 * (or no due date) is `current`.
 */
export function resolveAgingBucket(daysOverdue: number): AgingBucketKey {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  return "over_90";
}

export interface AgingBucketChipProps {
  /** Days past the due date; ≤0 (or not yet due) renders the `current` bucket. */
  daysOverdue: number;
  label?: string;
  className?: string;
}

/** The AR-aging bucket Ink-Chip (M5 §3.4, design MD4) — the worklist's color-coded aging column. */
export function AgingBucketChip({ daysOverdue, label, className }: AgingBucketChipProps) {
  return <InkChip status={BUCKET_TO_CHIP[resolveAgingBucket(daysOverdue)]} label={label} className={className} />;
}
