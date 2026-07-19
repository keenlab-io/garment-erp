import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveFilterChipRail } from "./active-filter-chip-rail";

describe("ActiveFilterChipRail", () => {
  it("renders nothing when no filter is applied", () => {
    const { container } = render(<ActiveFilterChipRail chips={[]} onClear={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a chip per active filter", () => {
    render(
      <ActiveFilterChipRail
        chips={[{ key: "dimension", label: "Month: 2026-01" }]}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("Month: 2026-01")).toBeInTheDocument();
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("calls onClear when Clear is clicked", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <ActiveFilterChipRail chips={[{ key: "dimension", label: "Month: 2026-01" }]} onClear={onClear} />,
    );
    await user.click(screen.getByText("Clear"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("calls onRemove with the chip's key when its remove button is clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <ActiveFilterChipRail
        chips={[{ key: "dimension", label: "Month: 2026-01" }]}
        onRemove={onRemove}
        onClear={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText("Remove filter: Month: 2026-01"));
    expect(onRemove).toHaveBeenCalledWith("dimension");
  });

  it("omits per-chip remove buttons when onRemove is not provided", () => {
    render(
      <ActiveFilterChipRail chips={[{ key: "dimension", label: "Month: 2026-01" }]} onClear={vi.fn()} />,
    );
    expect(screen.queryByLabelText("Remove filter: Month: 2026-01")).not.toBeInTheDocument();
  });
});
