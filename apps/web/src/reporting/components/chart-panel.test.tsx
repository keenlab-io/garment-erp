import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ChartPanel,
  categoryValueFromClick,
  categoryValueFromPieClick,
  seriesColor,
  sliceOpacity,
} from "./chart-panel";

const DATA = [
  { d: "2026-01", sales: 100 },
  { d: "2026-02", sales: 140 },
];
const SERIES = [{ key: "sales", label: "Sales" }];

describe("ChartPanel", () => {
  it("renders the title", () => {
    render(<ChartPanel title="Sales by month" kind="bar" data={DATA} xKey="d" series={SERIES} />);
    expect(screen.getByText("Sales by month")).toBeInTheDocument();
  });

  it("renders the chart's responsive container when data is present", () => {
    const { container } = render(
      <ChartPanel title="Sales by month" kind="bar" data={DATA} xKey="d" series={SERIES} />,
    );
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });

  it("exposes the chart as an accessible image labelled by its title", () => {
    render(<ChartPanel title="Sales by month" kind="bar" data={DATA} xKey="d" series={SERIES} />);
    expect(screen.getByRole("img", { name: "Sales by month" })).toBeInTheDocument();
  });

  it("shows an empty message instead of a chart when there is no data", () => {
    render(<ChartPanel title="Sales by month" kind="bar" data={[]} xKey="d" series={SERIES} />);
    expect(screen.getByText("No data for this selection.")).toBeInTheDocument();
    expect(document.querySelector(".recharts-responsive-container")).not.toBeInTheDocument();
  });

  it("shows a skeleton instead of a chart while loading", () => {
    render(<ChartPanel title="Sales by month" kind="bar" data={DATA} xKey="d" series={SERIES} loading />);
    expect(document.querySelector(".recharts-responsive-container")).not.toBeInTheDocument();
  });

  it("renders a line chart and a pie chart without crashing", () => {
    render(<ChartPanel title="Trend" kind="line" data={DATA} xKey="d" series={SERIES} />);
    render(<ChartPanel title="Split" kind="pie" data={DATA} xKey="d" series={SERIES} />);
  });
});

describe("categoryValueFromClick", () => {
  it("prefers activeLabel", () => {
    expect(categoryValueFromClick({ activeLabel: "2026-01" }, "d")).toBe("2026-01");
  });

  it("falls back to the first payload's dimension value", () => {
    expect(
      categoryValueFromClick({ activePayload: [{ payload: { d: "2026-02", sales: 140 } }] }, "d"),
    ).toBe("2026-02");
  });

  it("returns undefined when neither is present", () => {
    expect(categoryValueFromClick({}, "d")).toBeUndefined();
  });
});

describe("categoryValueFromPieClick", () => {
  it("reads the dimension value from the slice payload", () => {
    expect(categoryValueFromPieClick({ payload: { d: "2026-01", sales: 100 } }, "d")).toBe("2026-01");
  });

  it("falls back to the entry itself when there is no payload wrapper", () => {
    expect(categoryValueFromPieClick({ d: "2026-01", sales: 100 }, "d")).toBe("2026-01");
  });
});

describe("seriesColor", () => {
  it("cycles through the shared categorical palette", () => {
    expect(seriesColor(0)).not.toBe(seriesColor(1));
  });
});

describe("sliceOpacity", () => {
  it("is fully opaque with no active filter", () => {
    expect(sliceOpacity("2026-01", undefined)).toBe(1);
  });

  it("is fully opaque for the matching slice", () => {
    expect(sliceOpacity("2026-01", "2026-01")).toBe(1);
  });

  it("dims every non-matching slice", () => {
    expect(sliceOpacity("2026-02", "2026-01")).toBeLessThan(1);
  });
});
