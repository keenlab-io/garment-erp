import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlertsPanel, type ReportingAlert } from "./alerts-panel";

const ALERTS: ReportingAlert[] = [
  {
    id: "1",
    source: "stock",
    status: "stock-near-min",
    title: "Cotton fabric — near minimum",
    description: "12 m left",
    href: "/inventory/items/1",
  },
  {
    id: "2",
    source: "production",
    status: "delayed",
    title: "WO-1042 delayed",
    href: "/production/work-orders/1042",
  },
  {
    id: "3",
    source: "finance",
    status: "overdue",
    title: "INV-2201 overdue",
    href: "/sales/documents/2201",
  },
];

describe("AlertsPanel", () => {
  it("shows an empty message when there are no alerts", () => {
    render(<AlertsPanel title="Alerts" alerts={[]} onSelect={vi.fn()} />);
    expect(screen.getByText("No alerts — everything's on track.")).toBeInTheDocument();
  });

  it("unifies stock, production, and finance alerts in one list", () => {
    render(<AlertsPanel title="Alerts" alerts={ALERTS} onSelect={vi.fn()} />);
    expect(screen.getByText("Cotton fabric — near minimum")).toBeInTheDocument();
    expect(screen.getByText("WO-1042 delayed")).toBeInTheDocument();
    expect(screen.getByText("INV-2201 overdue")).toBeInTheDocument();
    expect(screen.getByText(/^Stock/)).toBeInTheDocument();
    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
  });

  it("calls onSelect with the alert when its View action is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AlertsPanel title="Alerts" alerts={ALERTS} onSelect={onSelect} />);
    await user.click(screen.getAllByText("View")[0]!);
    expect(onSelect).toHaveBeenCalledWith(ALERTS[0]);
  });

  it("gives each View button a distinct accessible name (WCAG 2.4.4 link purpose)", () => {
    render(<AlertsPanel title="Alerts" alerts={ALERTS} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "View Cotton fabric — near minimum" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View WO-1042 delayed" })).toBeInTheDocument();
  });

  it("shows loading skeletons instead of the list while loading", () => {
    render(<AlertsPanel title="Alerts" alerts={ALERTS} onSelect={vi.fn()} loading />);
    expect(screen.queryByText("Cotton fabric — near minimum")).not.toBeInTheDocument();
  });
});
