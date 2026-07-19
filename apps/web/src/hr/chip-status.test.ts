import { describe, it, expect } from "vitest";
import { PayrollRunStatus, CashAdvanceStatus } from "@erp/contracts";
import { payrollRunStatusToChip, cashAdvanceStatusToChip } from "./chip-status";

describe("payrollRunStatusToChip", () => {
  it("maps every PayrollRunStatus to a chip status", () => {
    expect(payrollRunStatusToChip(PayrollRunStatus.DRAFT)).toBe("draft");
    expect(payrollRunStatusToChip(PayrollRunStatus.CALCULATED)).toBe("in-progress");
    expect(payrollRunStatusToChip(PayrollRunStatus.APPROVED)).toBe("approved");
    expect(payrollRunStatusToChip(PayrollRunStatus.PAID)).toBe("paid");
    expect(payrollRunStatusToChip(PayrollRunStatus.CLOSED)).toBe("posted");
  });
});

describe("cashAdvanceStatusToChip", () => {
  it("maps every CashAdvanceStatus to a chip status", () => {
    expect(cashAdvanceStatusToChip(CashAdvanceStatus.SUBMITTED)).toBe("pending");
    expect(cashAdvanceStatusToChip(CashAdvanceStatus.APPROVED)).toBe("approved");
    expect(cashAdvanceStatusToChip(CashAdvanceStatus.REJECTED)).toBe("void");
    expect(cashAdvanceStatusToChip(CashAdvanceStatus.DISBURSED)).toBe("paid");
    expect(cashAdvanceStatusToChip(CashAdvanceStatus.REPAYING)).toBe("partial");
    expect(cashAdvanceStatusToChip(CashAdvanceStatus.CLEARED)).toBe("posted");
  });
});
