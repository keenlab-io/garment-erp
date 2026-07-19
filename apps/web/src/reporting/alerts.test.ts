import { describe, expect, it } from "vitest";
import { asMoney, asQty, WorkOrderStatus, WorkOrderStepStatus } from "@erp/contracts";
import {
  financeAlertsFromAging,
  productionAlertsFromTimeline,
  stockAlertsFromLowStock,
} from "./alerts";

describe("stockAlertsFromLowStock", () => {
  it("titles by item name when available, else falls back to the item id", () => {
    const rows = [
      { item_id: "i1", warehouse_id: "w1", on_hand: asQty("3.0000"), min_stock: asQty("10.0000") },
      { item_id: "i2", warehouse_id: null, on_hand: asQty("0.0000"), min_stock: asQty("5.0000") },
    ];
    const alerts = stockAlertsFromLowStock(rows, new Map([["i1", "Cotton Fabric"]]));

    expect(alerts).toEqual([
      {
        id: "i1:w1",
        source: "stock",
        status: "stock-near-min",
        title: "Cotton Fabric",
        description: "3.0000 / 10.0000",
        href: "/inventory/items/i1",
      },
      {
        id: "i2:-",
        source: "stock",
        status: "stock-near-min",
        title: "i2",
        description: "0.0000 / 5.0000",
        href: "/inventory/items/i2",
      },
    ]);
  });
});

describe("productionAlertsFromTimeline", () => {
  it("emits one alert per delayed step, skipping on-time steps", () => {
    const entries = [
      {
        id: "wo1",
        wo_no: "WO-114",
        customer_id: null,
        due_date: null,
        status: WorkOrderStatus.IN_PROGRESS,
        steps: [
          { id: "s1", wo_id: "wo1", routing_step_id: "r1", seq: 1, name: "Cut", status: WorkOrderStepStatus.COMPLETED, standard_time_min: 30, started_at: null, finished_at: null, assigned_to: null, machine: null, is_delayed: false },
          { id: "s2", wo_id: "wo1", routing_step_id: "r2", seq: 2, name: "Sew", status: WorkOrderStepStatus.IN_PROGRESS, standard_time_min: 60, started_at: null, finished_at: null, assigned_to: null, machine: null, is_delayed: true },
        ],
      },
    ];

    expect(productionAlertsFromTimeline(entries)).toEqual([
      {
        id: "s2",
        source: "production",
        status: "delayed",
        title: "WO-114 · Sew",
        description: "60m standard",
        href: "/production/work-orders/wo1",
      },
    ]);
  });
});

describe("financeAlertsFromAging", () => {
  it("only surfaces customers with a nonzero 90+ day balance", () => {
    const rows = [
      { customer_id: "c1", customer_name: "Acme Co.", current: asMoney("0"), d1_30: asMoney("0"), d31_60: asMoney("0"), d61_90: asMoney("0"), over_90: asMoney("1500.0000") },
      { customer_id: "c2", customer_name: "On-time Co.", current: asMoney("500.0000"), d1_30: asMoney("0"), d31_60: asMoney("0"), d61_90: asMoney("0"), over_90: asMoney("0.0000") },
    ];

    expect(financeAlertsFromAging(rows)).toEqual([
      {
        id: "c1",
        source: "finance",
        status: "overdue",
        title: "Acme Co.",
        description: "1500.0000",
        href: "/sales/customers/c1",
      },
    ]);
  });
});
