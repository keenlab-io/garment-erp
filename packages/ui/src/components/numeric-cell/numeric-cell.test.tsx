import { render, screen } from "@testing-library/react";
import { asMoney } from "@erp/contracts";
import { MoneyCell, QtyCell } from "./numeric-cell";

describe("MoneyCell", () => {
  it("formats a decimal string with grouping and currency", () => {
    render(<MoneyCell value={asMoney("53500.00")} />);
    expect(screen.getByText("฿53,500.00")).toBeInTheDocument();
  });

  it("rounds through decimal.js to the display scale (no float)", () => {
    render(<MoneyCell value="1240.5" />);
    expect(screen.getByText("฿1,240.50")).toBeInTheDocument();
  });

  it("weights negatives in danger and wraps them in parentheses", () => {
    render(<MoneyCell value="-2000.00" />);
    const cell = screen.getByText("(฿2,000.00)");
    expect(cell).toHaveClass("text-danger");
    expect(cell).toHaveClass("text-right");
    expect(cell).toHaveClass("tabular-nums");
  });

  it("can omit the currency symbol", () => {
    render(<MoneyCell value="16520.0000" currency="" />);
    expect(screen.getByText("16,520.00")).toBeInTheDocument();
  });
});

describe("QtyCell", () => {
  it("renders a unit-adjacent quantity", () => {
    render(<QtyCell value="4250" unit="ml" />);
    expect(screen.getByText("4,250.00 ml")).toBeInTheDocument();
  });

  it("weights negatives in danger with parentheses", () => {
    render(<QtyCell value="-3" unit="pcs" />);
    expect(screen.getByText("(3.00 pcs)")).toHaveClass("text-danger");
  });
});
