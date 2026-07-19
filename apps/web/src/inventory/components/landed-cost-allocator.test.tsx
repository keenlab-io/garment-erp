import * as React from "react";
import { describe, it, expect } from "vitest";
import type { Permission } from "@erp/contracts";
import { AllocMethod } from "@erp/contracts";
import { PermissionsProvider } from "@erp/ui";
import { render, screen, fireEvent } from "@testing-library/react";
import { LandedCostAllocator, type LandedCostLine } from "./landed-cost-allocator";

const LINES: LandedCostLine[] = [
  { id: "l1", itemLabel: "Cotton twill", qty: "100", unitPrice: "50.0000", unitWeight: "2" },
  { id: "l2", itemLabel: "Poly lining", qty: "50", unitPrice: "20.0000", unitWeight: "1" },
];

function Harness({ permissions = ["inventory.cost.view"] }: { permissions?: Permission[] }) {
  const [method, setMethod] = React.useState<AllocMethod>(AllocMethod.VALUE);
  const [freightTotal, setFreightTotal] = React.useState("300");
  return (
    <PermissionsProvider permissions={permissions} isSuperAdmin={false}>
      <LandedCostAllocator
        lines={LINES}
        method={method}
        onMethodChange={setMethod}
        freightTotal={freightTotal}
        onFreightTotalChange={setFreightTotal}
      />
    </PermissionsProvider>
  );
}

describe("LandedCostAllocator", () => {
  it("allocates freight by line value and shows the per-line preview reconciling to the total", () => {
    render(<Harness />);
    // VALUE weights: 100*50=5000, 50*20=1000 → 5/6 and 1/6 of 300
    expect(screen.getByText("฿250.00")).toBeInTheDocument();
    expect(screen.getByText("฿50.00")).toBeInTheDocument();
    // New unit cost: 50 + 250/100 = 52.50; 20 + 50/50 = 21.00
    expect(screen.getByText("฿52.50")).toBeInTheDocument();
    expect(screen.getByText("฿21.00")).toBeInTheDocument();
  });

  it("recomputes the preview live when the allocation method changes", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "By weight" }));
    // WEIGHT weights: 100*2=200, 50*1=50 → 4/5 and 1/5 of 300 = 240 / 60
    expect(screen.getByText("฿240.00")).toBeInTheDocument();
    expect(screen.getByText("฿60.00")).toBeInTheDocument();
  });

  it("recomputes the preview live when the freight total changes", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Freight / import total"), { target: { value: "600" } });
    expect(screen.getByText("฿500.00")).toBeInTheDocument();
    expect(screen.getByText("฿100.00")).toBeInTheDocument();
  });

  it("masks allocated cost and new unit cost without inventory.cost.view, while qty stays visible", () => {
    render(<Harness permissions={[]} />);
    expect(screen.queryByText("฿250.00")).not.toBeInTheDocument();
    expect(screen.getAllByText("••••").length).toBeGreaterThan(0);
    expect(screen.getByText("100.00")).toBeInTheDocument();
  });
});
