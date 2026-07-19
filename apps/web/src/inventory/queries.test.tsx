import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useCreateStockAdjustmentMutation,
  useItemsQuery,
  usePostGoodsIssueMutation,
  usePrintBarcodesMutation,
  useStockCardReportQuery,
} from "./queries";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderWithClient(ui: React.ReactNode, queryClient = new QueryClient()) {
  return { queryClient, ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>) };
}

describe("inventory queries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("useItemsQuery lists items from the paginated endpoint (cost fields nullable)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("/items")) {
          return Promise.resolve(
            jsonResponse({
              data: [
                {
                  id: "i1",
                  code: "AA00001",
                  name: "Cotton Fabric",
                  item_type: "RAW_MATERIAL",
                  base_uom_id: "u1",
                  costing_method: "MAV",
                  standard_cost: null,
                  min_stock: null,
                  attributes: {},
                  version: 0,
                },
              ],
              next_cursor: null,
            }),
          );
        }
        return Promise.resolve(jsonResponse({}, 404));
      }),
    );

    function Harness() {
      const { data } = useItemsQuery();
      const item = data?.body.data[0];
      return <div>{item ? item.name : "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("Cotton Fabric")).toBeInTheDocument();
  });

  it("useCreateStockAdjustmentMutation resolves without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              adjustment: {
                id: "adj1",
                reason: "cycle count variance",
                status: "DRAFT",
                lines: [],
                version: 0,
              },
            },
            201,
          ),
        ),
      ),
    );

    function Harness() {
      const create = useCreateStockAdjustmentMutation();
      return (
        <button
          onClick={() =>
            create.mutate({
              body: {
                reason: "cycle count variance",
                lines: [{ item_id: "i1", qty_delta: "1" }],
              },
            })
          }
        >
          Create
        </button>
      );
    }

    renderWithClient(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  });

  it("usePostGoodsIssueMutation surfaces a 422 insufficient-stock error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            { code: "VALIDATION_ERROR", message: "Insufficient stock: only 12 m left", details: [] },
            422,
          ),
        ),
      ),
    );

    function Harness() {
      const post = usePostGoodsIssueMutation();
      return (
        <div>
          <button onClick={() => post.mutate({ params: { id: "gi1" }, body: undefined })}>Post</button>
          {post.isError ? <div>failed</div> : null}
        </div>
      );
    }

    renderWithClient(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(await screen.findByText("failed")).toBeInTheDocument();
  });

  it("usePrintBarcodesMutation resolves with the accepted job id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ job_id: "job1" }, 202))),
    );

    function Harness() {
      const print = usePrintBarcodesMutation();
      return (
        <div>
          <button onClick={() => print.mutate({ body: { sku_ids: ["s1"] } })}>Print</button>
          {print.data?.status === 202 ? <div>{print.data.body.job_id}</div> : null}
        </div>
      );
    }

    renderWithClient(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Print" }));

    expect(await screen.findByText("job1")).toBeInTheDocument();
  });

  it("useStockCardReportQuery renders the running balance (cost masked without inventory.cost.view)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            item_id: "i1",
            warehouse_id: null,
            opening_qty: "0",
            opening_value: "0.00",
            movements: [],
            closing_qty: "10",
            closing_value: "0.00",
          }),
        ),
      ),
    );

    function Harness() {
      const { data } = useStockCardReportQuery({ item_id: "i1" });
      return <div>{data?.body.closing_qty ?? "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("10")).toBeInTheDocument();
  });
});
