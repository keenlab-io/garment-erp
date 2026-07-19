import { describe, it, expect } from "vitest";
import {
  subcontractStatusToChip,
  workOrderStatusToChip,
  workOrderStepStatusToChip,
} from "./chip-status";

describe("workOrderStatusToChip", () => {
  it("maps each work-order status", () => {
    expect(workOrderStatusToChip("PENDING")).toBe("pending");
    expect(workOrderStatusToChip("IN_PROGRESS")).toBe("in-progress");
    expect(workOrderStatusToChip("COMPLETED")).toBe("completed");
    expect(workOrderStatusToChip("CANCELLED")).toBe("void");
  });
});

describe("workOrderStepStatusToChip", () => {
  it("maps each step status when not delayed", () => {
    expect(workOrderStepStatusToChip("PENDING", false)).toBe("pending");
    expect(workOrderStepStatusToChip("IN_PROGRESS", false)).toBe("in-progress");
    expect(workOrderStepStatusToChip("COMPLETED", false)).toBe("completed");
    expect(workOrderStepStatusToChip("HOLD", false)).toBe("hold");
    expect(workOrderStepStatusToChip("OUTSOURCED", false)).toBe("outsourced");
    expect(workOrderStepStatusToChip("DEFECT", false)).toBe("overdue");
  });

  it("delayed wins over the raw status", () => {
    expect(workOrderStepStatusToChip("IN_PROGRESS", true)).toBe("delayed");
    expect(workOrderStepStatusToChip("COMPLETED", true)).toBe("delayed");
  });
});

describe("subcontractStatusToChip", () => {
  it("maps each subcontract status", () => {
    expect(subcontractStatusToChip("SENT")).toBe("pending");
    expect(subcontractStatusToChip("OVERDUE")).toBe("overdue");
    expect(subcontractStatusToChip("RECEIVED")).toBe("completed");
  });
});
