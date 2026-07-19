import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  ChartWrapper,
  REPORTING_CHART_PALETTE,
  CHART_GRID_STROKE,
  CHART_AXIS_TEXT,
  CHART_TOOLTIP_STYLE,
} from "./chart-wrapper";

describe("ChartWrapper", () => {
  it("sizes its container at the default height", () => {
    const { container } = render(
      <ChartWrapper>
        <div />
      </ChartWrapper>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe("100%");
    expect(wrapper.style.height).toBe("240px");
  });

  it("accepts a custom height", () => {
    const { container } = render(
      <ChartWrapper height={320}>
        <div />
      </ChartWrapper>,
    );
    expect((container.firstElementChild as HTMLElement).style.height).toBe("320px");
  });
});

describe("token-themed chart constants", () => {
  const bannedPrimitive = /--(?:ink|cyan|substrate|magenta)-/;
  const rawHex = /#[0-9a-fA-F]{3,8}\b/;

  it("never references a raw hex color", () => {
    for (const color of REPORTING_CHART_PALETTE) expect(color).not.toMatch(rawHex);
    expect(CHART_GRID_STROKE).not.toMatch(rawHex);
    expect(CHART_AXIS_TEXT).not.toMatch(rawHex);
    for (const value of Object.values(CHART_TOOLTIP_STYLE)) {
      if (typeof value === "string") expect(value).not.toMatch(rawHex);
    }
  });

  it("never references a banned primitive token name (semantic tokens only)", () => {
    for (const color of REPORTING_CHART_PALETTE) expect(color).not.toMatch(bannedPrimitive);
    expect(CHART_GRID_STROKE).not.toMatch(bannedPrimitive);
    expect(CHART_AXIS_TEXT).not.toMatch(bannedPrimitive);
  });

  it("has a categorical palette with several distinct colors", () => {
    expect(new Set(REPORTING_CHART_PALETTE).size).toBe(REPORTING_CHART_PALETTE.length);
    expect(REPORTING_CHART_PALETTE.length).toBeGreaterThanOrEqual(4);
  });
});
