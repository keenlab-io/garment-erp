import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportValidationTable, type ImportRowResult } from "./import-validation-table";

const ROWS: ImportRowResult[] = [
  { row: 1, status: "ok" },
  { row: 2, status: "error", reason: "Unknown role code" },
  { row: 3, status: "ok" },
];

describe("ImportValidationTable", () => {
  it("shows the empty-state hint before any file is uploaded", () => {
    render(<ImportValidationTable rows={[]} onFilesSelected={() => {}} onImport={() => {}} />);
    expect(screen.getByText("Upload a file to see the validation review.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders each row's OK/error status and reason", () => {
    render(<ImportValidationTable rows={ROWS} onFilesSelected={() => {}} onImport={() => {}} />);

    expect(screen.getAllByText("OK")).toHaveLength(2);
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Unknown role code")).toBeInTheDocument();
  });

  it("labels the primary action with the valid row count and disables it with zero valid rows", () => {
    const { rerender } = render(
      <ImportValidationTable rows={ROWS} onFilesSelected={() => {}} onImport={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Import 2 valid rows" })).toBeEnabled();

    rerender(
      <ImportValidationTable
        rows={[{ row: 1, status: "error", reason: "bad" }]}
        onFilesSelected={() => {}}
        onImport={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Import 0 valid rows" })).toBeDisabled();
  });

  it("calls onImport when the primary action is clicked", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    render(<ImportValidationTable rows={ROWS} onFilesSelected={() => {}} onImport={onImport} />);

    await user.click(screen.getByRole("button", { name: "Import 2 valid rows" }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("calls onFilesSelected with the chosen file", async () => {
    const user = userEvent.setup();
    const onFilesSelected = vi.fn();
    render(<ImportValidationTable rows={[]} onFilesSelected={onFilesSelected} onImport={() => {}} />);

    const file = new File(["a,b,c"], "import.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = screen.getByLabelText("Browse files");
    await user.upload(input, file);

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });
});
