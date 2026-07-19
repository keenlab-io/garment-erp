import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import type { Permission } from "@erp/contracts";
import { PermissionsProvider } from "@erp/ui";
import { render, screen, fireEvent } from "@testing-library/react";
import { BomTreeEditor, type BomTreeNode } from "./bom-tree-editor";

const ROOT: BomTreeNode = {
  id: "finished",
  itemLabel: "Denim jacket",
  qty: "1",
  scrapPct: "0",
  unitCost: "0.0000",
  extendedCost: "0.0000",
  children: [
    { id: "fabric", itemLabel: "Denim fabric", qty: "1.5", scrapPct: "0.05", unitCost: "80.0000", extendedCost: "126.0000" },
    {
      id: "zipper-assembly",
      itemLabel: "Zipper assembly",
      qty: "1",
      scrapPct: "0",
      unitCost: "12.0000",
      extendedCost: "12.0000",
      hasChildren: true,
    },
  ],
};

function renderTree(overrides: Partial<React.ComponentProps<typeof BomTreeEditor>> = {}, permissions: Permission[] = ["inventory.cost.view"]) {
  const onToggleExpand = vi.fn();
  render(
    <PermissionsProvider permissions={permissions} isSuperAdmin={false}>
      <BomTreeEditor root={ROOT} expandedIds={[]} onToggleExpand={onToggleExpand} {...overrides} />
    </PermissionsProvider>,
  );
  return { onToggleExpand };
}

describe("BomTreeEditor", () => {
  it("renders the root and its direct components", () => {
    renderTree();
    expect(screen.getByText("Denim jacket")).toBeInTheDocument();
    expect(screen.getByText("Denim fabric")).toBeInTheDocument();
    expect(screen.getByText("Zipper assembly")).toBeInTheDocument();
  });

  it("shows scrap as a percentage derived from the fraction", () => {
    renderTree();
    expect(screen.getByText("5.0%")).toBeInTheDocument();
  });

  it("toggles a node's expand state via onToggleExpand and requests lazy children only once", () => {
    const { onToggleExpand } = renderTree();
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(onToggleExpand).toHaveBeenCalledWith("zipper-assembly");
  });

  it("calls onExpand only for a hasChildren node with no children resolved yet", () => {
    const onExpand = vi.fn();
    renderTree({ expandedIds: [], onExpand });
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(onExpand.mock.calls[0]![0]).toMatchObject({ id: "zipper-assembly" });
  });

  it("renders no expand control for a leaf component", () => {
    renderTree();
    // Only the zipper-assembly node (hasChildren) gets an Expand button; the fabric leaf doesn't.
    expect(screen.getAllByRole("button", { name: "Expand" })).toHaveLength(1);
  });

  it("masks unit and extended cost without inventory.cost.view", () => {
    renderTree({}, []);
    expect(screen.queryByText("฿80.00")).not.toBeInTheDocument();
    expect(screen.getAllByText("••••").length).toBeGreaterThan(0);
  });

  it("shows the rolled-up and conversion cost summary when provided", () => {
    renderTree({ conversionCost: "5.0000", rolledUpCost: "150.0000" });
    expect(screen.getByText("Conversion cost")).toBeInTheDocument();
    expect(screen.getByText("Rolled-up cost")).toBeInTheDocument();
    expect(screen.getByText("฿150.00")).toBeInTheDocument();
  });
});
