import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PermissionsProvider } from "@erp/ui";
import { KpiStatCard } from "./kpi-stat-card";

describe("KpiStatCard", () => {
  it("formats a money value with currency and grouping", () => {
    render(<KpiStatCard label="Revenue" value="1234567.891" format="money" />);
    expect(screen.getByText("฿1,234,567.8910")).toBeInTheDocument();
  });

  it("formats a qty value with a unit", () => {
    render(<KpiStatCard label="Units sold" value="4200" format="qty" unit="pcs" />);
    expect(screen.getByText("4,200.000000 pcs")).toBeInTheDocument();
  });

  it("wraps a negative value in accounting parentheses and danger ink", () => {
    render(<KpiStatCard label="Net" value="-500" format="money" />);
    const value = screen.getByText("(฿500.0000)");
    expect(value).toHaveClass("text-danger");
  });

  it("renders an up delta with a ▲ glyph, not color alone", () => {
    render(<KpiStatCard label="Revenue" value="100" delta={{ percent: 12.4 }} />);
    expect(screen.getByText("▲")).toBeInTheDocument();
    expect(screen.getByText("12.4%")).toBeInTheDocument();
  });

  it("renders a down delta with a ▼ glyph", () => {
    render(<KpiStatCard label="Revenue" value="100" delta={{ percent: -3.1 }} />);
    expect(screen.getByText("▼")).toBeInTheDocument();
    expect(screen.getByText("3.1%")).toBeInTheDocument();
  });

  it("masks the value when the viewer lacks the gating permission", () => {
    render(
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <KpiStatCard label="Margin" value="9999" format="money" permission="inventory.cost.view" />
      </PermissionsProvider>,
    );
    expect(screen.getByText("••••")).toBeInTheDocument();
    expect(screen.queryByText("฿9,999.0000")).not.toBeInTheDocument();
  });

  it("reveals the value when the viewer holds the gating permission", () => {
    render(
      <PermissionsProvider permissions={["inventory.cost.view"]} isSuperAdmin={false}>
        <KpiStatCard label="Margin" value="9999" format="money" permission="inventory.cost.view" />
      </PermissionsProvider>,
    );
    expect(screen.getByText("฿9,999.0000")).toBeInTheDocument();
  });

  it("renders a sparkline without crashing when trend values are provided", () => {
    const { container } = render(
      <KpiStatCard label="Revenue" value="100" sparkline={[10, 12, 9, 14, 20]} />,
    );
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });

  it("renders a loading skeleton without the value", () => {
    render(<KpiStatCard label="Revenue" value="100" loading />);
    expect(screen.queryByText("฿100.0000")).not.toBeInTheDocument();
  });
});
