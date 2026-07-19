import { describe, it, expect } from "vitest";
import { asMoney, asQty, type Permission, type StockCardReport } from "@erp/contracts";
import { PermissionsProvider } from "@erp/ui";
import { render, screen, within } from "@testing-library/react";
import { StockCardLedger } from "./stock-card-ledger";

const REPORT: StockCardReport = {
  item_id: "item-1",
  warehouse_id: null,
  opening_qty: asQty("100.000000"),
  opening_value: asMoney("5000.0000"),
  movements: [
    {
      id: "m1",
      at: "2026-07-01T00:00:00.000Z",
      direction: "IN",
      qty: asQty("50.000000"),
      unit_cost: asMoney("12.5000"),
      ref_type: "GOODS_RECEIPT",
      ref_id: "gr-1",
    },
    {
      id: "m2",
      at: "2026-07-02T00:00:00.000Z",
      direction: "OUT",
      qty: asQty("30.000000"),
      unit_cost: asMoney("12.5000"),
      ref_type: "GOODS_ISSUE",
      ref_id: "gi-1",
    },
    {
      id: "m3",
      at: "2026-07-03T00:00:00.000Z",
      direction: "ADJUST",
      qty: asQty("-5.000000"),
      unit_cost: asMoney("12.5000"),
      ref_type: "ADJUSTMENT",
      ref_id: "adj-1",
    },
  ],
  closing_qty: asQty("115.000000"),
  closing_value: asMoney("5750.0000"),
};

function renderLedger(permissions: Permission[] = []) {
  return render(
    <PermissionsProvider permissions={permissions} isSuperAdmin={false}>
      <StockCardLedger report={REPORT} formatDate={(iso) => iso.slice(0, 10)} />
    </PermissionsProvider>,
  );
}

describe("StockCardLedger", () => {
  it("computes a running balance across IN/OUT/ADJUST movements", () => {
    renderLedger(["inventory.cost.view"]);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]!).getByText("100.00")).toBeInTheDocument(); // opening
    expect(within(rows[2]!).getByText("150.00")).toBeInTheDocument(); // +50 IN
    expect(within(rows[3]!).getByText("120.00")).toBeInTheDocument(); // -30 OUT
    expect(within(rows[5]!).getByText("115.00")).toBeInTheDocument(); // closing balance
  });

  it("splits In/Out columns by movement direction, including a signed ADJUST", () => {
    renderLedger(["inventory.cost.view"]);
    const rows = screen.getAllByRole("row");
    expect(rows[2]).toHaveTextContent("50.00"); // IN row shows qty in the In column
    expect(rows[3]).toHaveTextContent("30.00"); // OUT row shows qty in the Out column
    expect(rows[4]).toHaveTextContent("5.00"); // negative ADJUST shows as Out
  });

  it("masks unit cost without inventory.cost.view while balance stays visible", () => {
    renderLedger([]);
    expect(screen.queryByText("฿12.50")).not.toBeInTheDocument();
    expect(screen.getAllByText("••••").length).toBeGreaterThan(0);
    const rows = screen.getAllByRole("row");
    expect(within(rows[5]!).getByText("115.00")).toBeInTheDocument(); // closing balance
  });

  it("reveals unit cost with inventory.cost.view", () => {
    renderLedger(["inventory.cost.view"]);
    expect(screen.getAllByText("฿12.50").length).toBeGreaterThan(0);
  });

  it("renders no row actions — the ledger has no interactive controls", () => {
    renderLedger(["inventory.cost.view"]);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
