import { render, screen, fireEvent } from "@testing-library/react";
import { ScanField, type ScanEntry } from "./scan-field";

describe("ScanField", () => {
  it("commits a scan on Enter with the current qty, then clears the code input", () => {
    const onScan = vi.fn();
    render(<ScanField recentScans={[]} onScan={onScan} onUndo={() => {}} />);
    const input = screen.getByPlaceholderText("Scan or enter a code");
    fireEvent.change(input, { target: { value: "SKU-001" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onScan).toHaveBeenCalledWith("SKU-001", "1");
    expect(input).toHaveValue("");
  });

  it("ignores Enter on a blank code", () => {
    const onScan = vi.fn();
    render(<ScanField recentScans={[]} onScan={onScan} onUndo={() => {}} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Scan or enter a code"), { key: "Enter" });
    expect(onScan).not.toHaveBeenCalled();
  });

  it("steps the quantity up/down and floors at qtyMin", () => {
    render(<ScanField recentScans={[]} onScan={() => {}} onUndo={() => {}} qtyMin="0" />);
    const qty = screen.getByLabelText("Qty");
    expect(qty).toHaveValue(1);
    fireEvent.click(screen.getByLabelText("Increase quantity"));
    expect(qty).toHaveValue(2);
    fireEvent.click(screen.getByLabelText("Decrease quantity"));
    fireEvent.click(screen.getByLabelText("Decrease quantity"));
    expect(qty).toHaveValue(0);
  });

  it("renders only the last five scans with a working undo", () => {
    const onUndo = vi.fn();
    const scans: ScanEntry[] = Array.from({ length: 7 }, (_, i) => ({
      id: `${i}`,
      code: `CODE-${i}`,
      qty: "1.000000",
    }));
    render(<ScanField recentScans={scans} onScan={() => {}} onUndo={onUndo} />);
    expect(screen.getAllByText(/CODE-/)).toHaveLength(5);
    expect(screen.getByText("CODE-0")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Undo" })[0]!);
    expect(onUndo).toHaveBeenCalledWith("0");
  });

  it("shows a camera trigger only when onCameraScan is provided", () => {
    const { rerender } = render(<ScanField recentScans={[]} onScan={() => {}} onUndo={() => {}} />);
    expect(screen.queryByLabelText("Scan with camera")).not.toBeInTheDocument();
    rerender(<ScanField recentScans={[]} onScan={() => {}} onUndo={() => {}} onCameraScan={() => {}} />);
    expect(screen.getByLabelText("Scan with camera")).toBeInTheDocument();
  });
});
