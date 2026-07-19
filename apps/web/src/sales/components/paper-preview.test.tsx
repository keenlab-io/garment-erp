import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaperPreview, type PaperPreviewLine } from "./paper-preview";

const LINES: PaperPreviewLine[] = [
  { id: "l1", description: "Cotton jersey", qty: "200.000000", unitPrice: "250.0000", lineTotal: "50000.0000" },
];

describe("PaperPreview", () => {
  it("renders the document type, doc no, and lines", () => {
    render(
      <PaperPreview
        docTypeLabel="Quotation"
        docNo="QV20260042"
        lines={LINES}
        totals={{ subtotal: "50000.0000", vatAmount: "3500.0000", grandTotal: "53500.0000" }}
      />,
    );
    expect(screen.getByText("Quotation")).toBeInTheDocument();
    expect(screen.getByText("QV20260042")).toBeInTheDocument();
    expect(screen.getByText("Cotton jersey")).toBeInTheDocument();
    expect(screen.getByText("฿53,500.00")).toBeInTheDocument();
  });

  it("re-breaks the totals live when the caller passes VAT-inclusive vs exclusive totals", () => {
    const { rerender } = render(
      <PaperPreview
        docTypeLabel="Quotation"
        lines={LINES}
        totals={{ subtotal: "50000.0000", vatAmount: "3500.0000", grandTotal: "53500.0000" }}
      />,
    );
    expect(screen.getAllByText("฿50,000.00")).toHaveLength(2); // the line total and the subtotal

    rerender(
      <PaperPreview
        docTypeLabel="Quotation"
        lines={LINES}
        totals={{ subtotal: "49065.4206", vatAmount: "3434.5794", grandTotal: "52500.0000" }}
      />,
    );
    expect(screen.getByText("฿49,065.42")).toBeInTheDocument();
  });

  it("shows WHT as a deduction and highlights the net-to-receive row", () => {
    render(
      <PaperPreview
        docTypeLabel="Invoice"
        lines={LINES}
        totals={{
          subtotal: "50000.0000",
          vatAmount: "3500.0000",
          grandTotal: "53500.0000",
          whtAmount: "1500.0000",
        }}
      />,
    );
    expect(screen.getByText("(฿1,500.00)")).toBeInTheDocument();
    expect(screen.getByText("Net to receive")).toBeInTheDocument();
    expect(screen.getByText("฿52,000.00")).toBeInTheDocument();
  });

  it("omits the WHT row and net-to-receive highlight with no withholding", () => {
    render(
      <PaperPreview
        docTypeLabel="Quotation"
        lines={LINES}
        totals={{ subtotal: "50000.0000", vatAmount: "3500.0000", grandTotal: "53500.0000" }}
      />,
    );
    expect(screen.queryByText("Net to receive")).not.toBeInTheDocument();
  });

  it("renders the bill-to block with the customer's tax fields", () => {
    render(
      <PaperPreview
        docTypeLabel="Quotation"
        customer={{ name: "Siam Garments Co.", taxId: "0105561000001", branchCode: "HQ" }}
        lines={LINES}
        totals={{ subtotal: "50000.0000", vatAmount: "3500.0000", grandTotal: "53500.0000" }}
      />,
    );
    expect(screen.getByText("Siam Garments Co.")).toBeInTheDocument();
    expect(screen.getByText("0105561000001")).toBeInTheDocument();
  });
});
