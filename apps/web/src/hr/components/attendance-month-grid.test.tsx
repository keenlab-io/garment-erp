import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttendanceMonthGrid, type AttendanceRecord } from "./attendance-month-grid";

const EMPLOYEES = [{ id: "e1", name: "Somchai Jaidee" }];
const RECORDS: AttendanceRecord[] = [
  { employeeId: "e1", date: "2026-07-01", status: "present" },
  { employeeId: "e1", date: "2026-07-03", status: "absent" },
];

describe("AttendanceMonthGrid", () => {
  it("renders a column per day of the period", () => {
    render(<AttendanceMonthGrid period="2026-07" employees={EMPLOYEES} records={RECORDS} />);
    expect(screen.getByRole("columnheader", { name: "31" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "32" })).not.toBeInTheDocument();
  });

  it("shows the recorded status for each cell and unrecorded otherwise", () => {
    render(<AttendanceMonthGrid period="2026-07" employees={EMPLOYEES} records={RECORDS} />);
    expect(screen.getByLabelText("Somchai Jaidee, 2026-07-01: Present")).toBeInTheDocument();
    expect(screen.getByLabelText("Somchai Jaidee, 2026-07-03: Absent")).toBeInTheDocument();
    expect(screen.getByLabelText("Somchai Jaidee, 2026-07-02: No record")).toBeInTheDocument();
  });

  it("shows the empty state with no employees in scope", () => {
    render(<AttendanceMonthGrid period="2026-07" employees={[]} records={[]} />);
    expect(screen.getByText("No employees in scope.")).toBeInTheDocument();
  });
});
