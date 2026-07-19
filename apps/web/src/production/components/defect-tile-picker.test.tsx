import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DefectTilePicker } from "./defect-tile-picker";

describe("DefectTilePicker", () => {
  it("disables submit until a tile is selected", async () => {
    const user = userEvent.setup();
    render(<DefectTilePicker onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Report defect" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Misprint" }));
    expect(screen.getByRole("button", { name: "Report defect" })).toBeEnabled();
  });

  it("steps the quantity with +/- and never below qtyMin", async () => {
    const user = userEvent.setup();
    render(<DefectTilePicker onSubmit={vi.fn()} qtyMin="1" />);
    await user.click(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(screen.getByText("1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("submits the selected tile's label and qty, then resets", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DefectTilePicker onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Bad stitch" }));
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    await user.click(screen.getByRole("button", { name: "Report defect" }));
    expect(onSubmit).toHaveBeenCalledWith("Bad stitch", "2");
    expect(screen.getByRole("button", { name: "Report defect" })).toBeDisabled();
  });
});
