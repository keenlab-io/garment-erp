import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportExportFormat } from "@erp/contracts";
import { ScheduleEditor, type ScheduleEditorValue } from "./schedule-editor";

const REPORT_OPTIONS = [{ key: "sales.overview", label: "Sales overview" }];

function baseValue(overrides: Partial<ScheduleEditorValue> = {}): ScheduleEditorValue {
  return {
    name: "Monday digest",
    reportKey: "sales.overview",
    cadence: { frequency: "weekly", dayOfWeek: 1, time: "08:00" },
    recipients: ["owner@example.com"],
    format: ReportExportFormat.PDF,
    isActive: true,
    ...overrides,
  };
}

describe("ScheduleEditor", () => {
  it("previews the friendly cadence description", () => {
    render(
      <ScheduleEditor value={baseValue()} onChange={vi.fn()} reportOptions={REPORT_OPTIONS} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText("Sends Every Monday 08:00")).toBeInTheDocument();
  });

  it("shows the day-of-week field only for a weekly cadence", () => {
    const { rerender } = render(
      <ScheduleEditor value={baseValue()} onChange={vi.fn()} reportOptions={REPORT_OPTIONS} onSubmit={vi.fn()} />,
    );
    expect(screen.getByRole("combobox", { name: "Day of week" })).toBeInTheDocument();

    rerender(
      <ScheduleEditor
        value={baseValue({ cadence: { frequency: "daily", time: "08:00" } })}
        onChange={vi.fn()}
        reportOptions={REPORT_OPTIONS}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByRole("combobox", { name: "Day of week" })).not.toBeInTheDocument();
  });

  it("calls onChange with the updated name as the user types", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScheduleEditor value={baseValue({ name: "" })} onChange={onChange} reportOptions={REPORT_OPTIONS} onSubmit={vi.fn()} />,
    );
    await user.type(screen.getByLabelText("Schedule name"), "X");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: "X" }));
  });

  it("adds a recipient and clears the draft field", async () => {
    const user = userEvent.setup();
    let value = baseValue({ recipients: [] });
    const onChange = vi.fn((next: ScheduleEditorValue) => {
      value = next;
    });
    const { rerender } = render(
      <ScheduleEditor value={value} onChange={onChange} reportOptions={REPORT_OPTIONS} onSubmit={vi.fn()} />,
    );
    await user.type(screen.getByPlaceholderText("name@example.com"), "a@b.com");
    await user.click(screen.getByText("Add"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ recipients: ["a@b.com"] }));
    rerender(
      <ScheduleEditor value={value} onChange={onChange} reportOptions={REPORT_OPTIONS} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
  });

  it("removes a recipient when its remove button is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScheduleEditor value={baseValue()} onChange={onChange} reportOptions={REPORT_OPTIONS} onSubmit={vi.fn()} />,
    );
    await user.click(screen.getByLabelText("Remove owner@example.com"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ recipients: [] }));
  });

  it("calls onSubmit when the form is submitted", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ScheduleEditor value={baseValue()} onChange={vi.fn()} reportOptions={REPORT_OPTIONS} onSubmit={onSubmit} />,
    );
    await user.click(screen.getByText("Save schedule"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("omits Run now when no handler is given, and calls it when one is", async () => {
    const user = userEvent.setup();
    const onRunNow = vi.fn();
    const { rerender } = render(
      <ScheduleEditor value={baseValue()} onChange={vi.fn()} reportOptions={REPORT_OPTIONS} onSubmit={vi.fn()} />,
    );
    expect(screen.queryByText("Run now")).not.toBeInTheDocument();

    rerender(
      <ScheduleEditor
        value={baseValue()}
        onChange={vi.fn()}
        reportOptions={REPORT_OPTIONS}
        onSubmit={vi.fn()}
        onRunNow={onRunNow}
      />,
    );
    await user.click(screen.getByText("Run now"));
    expect(onRunNow).toHaveBeenCalledTimes(1);
  });

  it("toggles the active switch", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScheduleEditor value={baseValue()} onChange={onChange} reportOptions={REPORT_OPTIONS} onSubmit={vi.fn()} />,
    );
    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
  });
});
