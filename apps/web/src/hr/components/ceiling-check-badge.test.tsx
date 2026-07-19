import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CeilingCheckBadge } from "./ceiling-check-badge";

describe("CeilingCheckBadge", () => {
  it("shows within-ceiling when the amount is at or under 50% of the ceiling", () => {
    render(<CeilingCheckBadge amount="5000.00" ceiling="10000.00" />);
    expect(screen.getByText("Within ceiling")).toBeInTheDocument();
  });

  it("shows approaching when the amount is over 50% but not over the ceiling", () => {
    render(<CeilingCheckBadge amount="7500.00" ceiling="10000.00" />);
    expect(screen.getByText("Approaching ceiling")).toBeInTheDocument();
  });

  it("shows over-ceiling when the amount exceeds the ceiling", () => {
    render(<CeilingCheckBadge amount="12000.00" ceiling="10000.00" />);
    expect(screen.getByText("Over ceiling")).toBeInTheDocument();
  });

  it("supports label overrides", () => {
    render(
      <CeilingCheckBadge amount="1000.00" ceiling="10000.00" labels={{ within: "OK" }} />,
    );
    expect(screen.getByText("OK")).toBeInTheDocument();
  });
});
