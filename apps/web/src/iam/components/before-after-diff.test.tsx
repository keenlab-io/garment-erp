import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BeforeAfterDiff } from "./before-after-diff";

describe("BeforeAfterDiff", () => {
  it("renders a row per field present in either snapshot", () => {
    render(
      <BeforeAfterDiff
        before={{ name: "Old role", permission_count: 3 }}
        after={{ name: "New role", permission_count: 3 }}
      />,
    );

    expect(screen.getByText("Old role")).toBeInTheDocument();
    expect(screen.getByText("New role")).toBeInTheDocument();
    expect(screen.getAllByText("3")).toHaveLength(2);
  });

  it("highlights only the changed fields", () => {
    render(<BeforeAfterDiff before={{ name: "Old", count: 1 }} after={{ name: "New", count: 1 }} />);

    const changedCell = screen.getByText("New").closest("div.grid");
    const unchangedCell = screen.getAllByText("1")[0]!.closest("div.grid");
    expect(changedCell).toHaveClass("bg-warning-subtle");
    expect(unchangedCell).not.toHaveClass("bg-warning-subtle");
  });

  it("renders fields only present in one snapshot with the empty placeholder", () => {
    render(<BeforeAfterDiff before={null} after={{ name: "Created" }} />);
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the no-changes message when both snapshots are empty", () => {
    render(<BeforeAfterDiff before={null} after={null} />);
    expect(screen.getByText("No field changes recorded.")).toBeInTheDocument();
  });
});
