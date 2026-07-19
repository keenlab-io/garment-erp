import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvoiceStatus, QuotationStatus } from "@erp/contracts";
import { DocLifecycleChip, docLifecycleToChip } from "./doc-lifecycle-chip";

describe("docLifecycleToChip", () => {
  it("maps every quotation and invoice status to a chip status", () => {
    for (const status of [...Object.values(QuotationStatus), ...Object.values(InvoiceStatus)]) {
      expect(docLifecycleToChip(status)).toBeTruthy();
    }
  });

  it("maps converted to success and expired to warning", () => {
    expect(docLifecycleToChip(QuotationStatus.CONVERTED)).toBe("converted");
    expect(docLifecycleToChip(QuotationStatus.EXPIRED)).toBe("expired");
  });
});

describe("DocLifecycleChip", () => {
  it("renders void struck through and muted (never deleted)", () => {
    const { container } = render(<DocLifecycleChip status={QuotationStatus.VOID} />);
    const chip = container.firstElementChild as HTMLElement;
    expect(chip).toHaveClass("line-through");
    expect(screen.getByText("Void")).toBeInTheDocument();
  });

  it("renders an invoice's PARTIALLY_PAID as the partial (warning) chip", () => {
    render(<DocLifecycleChip status={InvoiceStatus.PARTIALLY_PAID} />);
    expect(screen.getByText("Partial")).toBeInTheDocument();
  });

  it("accepts a label override", () => {
    render(<DocLifecycleChip status={QuotationStatus.SENT} label="ส่งแล้ว" />);
    expect(screen.getByText("ส่งแล้ว")).toBeInTheDocument();
  });
});
