import type { ChipStatus } from "@erp/ui";
import { TenantStatus } from "@erp/contracts";

/** Tenant lifecycle → shared Ink-Chip swatch (no dedicated chip token; the label carries the meaning). */
const TENANT_STATUS_TO_CHIP: Record<TenantStatus, ChipStatus> = {
  [TenantStatus.ACTIVE]: "completed",
  [TenantStatus.READ_ONLY]: "hold",
  [TenantStatus.SUSPENDED]: "delayed",
  [TenantStatus.PURGING]: "void",
};

export function tenantStatusToChip(status: TenantStatus): ChipStatus {
  return TENANT_STATUS_TO_CHIP[status];
}
