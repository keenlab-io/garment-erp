import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { asMoney, asQty } from "@erp/contracts";
import { DocumentLineEditor, emptyDocumentLine, type DocumentLineEditorLine } from "./document-line-editor";

const ITEM_OPTIONS = [{ value: "i1", label: "FAB-001 · Cotton jersey" }];

function Harness({ initial }: { initial: DocumentLineEditorLine[] }) {
  const [lines, setLines] = React.useState(initial);
  return <DocumentLineEditor lines={lines} onLinesChange={setLines} itemOptions={ITEM_OPTIONS} />;
}

describe("emptyDocumentLine", () => {
  it("defaults to a qty of 1 and a zero price", () => {
    const line = emptyDocumentLine();
    expect(line.qty).toBe("1");
    expect(line.unit_price).toBe("0.00");
    expect(line.id).toBeTruthy();
  });
});

describe("DocumentLineEditor", () => {
  it("shows the live per-line total", () => {
    render(
      <Harness
        initial={[{ id: "l1", description: "Jersey", qty: asQty("200"), unit_price: asMoney("250.00") }]}
      />,
    );
    expect(screen.getByText("฿50,000.00")).toBeInTheDocument();
  });

  it("shows a zero total instead of crashing when qty or unit price is cleared mid-edit", () => {
    render(
      <Harness
        initial={[{ id: "l1", description: "Jersey", qty: asQty("200"), unit_price: asMoney("250.00") }]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "" } });
    expect(screen.getByText("฿0.00")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Unit price"), { target: { value: "" } });
    expect(screen.getByText("฿0.00")).toBeInTheDocument();
  });

  it("recomputes the total live as qty changes", () => {
    render(
      <Harness
        initial={[{ id: "l1", description: "Jersey", qty: asQty("200"), unit_price: asMoney("250.00") }]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "10" } });
    expect(screen.getByText("฿2,500.00")).toBeInTheDocument();
  });

  it("subtracts a discount from the total", () => {
    render(
      <Harness
        initial={[
          {
            id: "l1",
            description: "Jersey",
            qty: asQty("10"),
            unit_price: asMoney("100.00"),
            discount: asMoney("50.00"),
          },
        ]}
      />,
    );
    expect(screen.getByText("฿950.00")).toBeInTheDocument();
  });

  it("adds a new empty line", () => {
    render(<Harness initial={[emptyDocumentLine()]} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add line" }));
    expect(screen.getAllByLabelText("Qty")).toHaveLength(2);
  });

  it("removes a line but never the last one", () => {
    const onLinesChange = vi.fn();
    render(
      <DocumentLineEditor
        lines={[emptyDocumentLine(), emptyDocumentLine()]}
        onLinesChange={onLinesChange}
        itemOptions={ITEM_OPTIONS}
      />,
    );
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    expect(removeButtons.every((btn) => !btn.hasAttribute("disabled"))).toBe(true);
    fireEvent.click(removeButtons[0]!);
    expect(onLinesChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({})]));
    expect(onLinesChange.mock.calls[0]![0]).toHaveLength(1);
  });

  it("disables remove on the only remaining line", () => {
    render(<Harness initial={[emptyDocumentLine()]} />);
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  });
});
