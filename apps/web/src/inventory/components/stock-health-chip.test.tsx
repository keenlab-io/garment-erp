import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StockHealthChip, resolveStockHealth } from "./stock-health-chip";

describe("resolveStockHealth", () => {
  it("is ok when on-hand is above the minimum", () => {
    expect(resolveStockHealth("50", "10")).toBe("stock-ok");
  });

  it("is near-min when on-hand is at or below the minimum", () => {
    expect(resolveStockHealth("10", "10")).toBe("stock-near-min");
    expect(resolveStockHealth("5", "10")).toBe("stock-near-min");
  });

  it("is never near-min with no configured minimum", () => {
    expect(resolveStockHealth("0", null)).toBe("stock-ok");
  });

  it("dead wins over the on-hand/min comparison", () => {
    expect(resolveStockHealth("50", "10", true)).toBe("stock-dead");
  });
});

describe("StockHealthChip", () => {
  it("renders the ok status by default", () => {
    render(<StockHealthChip onHand="50" minStock="10" />);
    expect(screen.getByText("In stock")).toBeInTheDocument();
  });

  it("renders near-minimum with an on-hand at the floor", () => {
    render(<StockHealthChip onHand="10" minStock="10" />);
    expect(screen.getByText("Near minimum")).toBeInTheDocument();
  });

  it("renders dead stock when flagged", () => {
    render(<StockHealthChip onHand="50" minStock="10" dead />);
    expect(screen.getByText("Dead stock")).toBeInTheDocument();
  });
});
