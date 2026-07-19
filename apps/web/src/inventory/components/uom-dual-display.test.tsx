import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UomDualDisplay } from "./uom-dual-display";

describe("UomDualDisplay", () => {
  it("shows both the receiving UOM and its base-UOM equivalent", () => {
    render(<UomDualDisplay qty="1" uomLabel="roll" baseQty="50" baseUomLabel="m" />);
    expect(screen.getByText("1.00 roll")).toBeInTheDocument();
    expect(screen.getByText("50.00 m")).toBeInTheDocument();
    expect(screen.getByText("=")).toBeInTheDocument();
  });
});
