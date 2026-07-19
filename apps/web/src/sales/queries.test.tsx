import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useAgingReportQuery,
  useCustomersQuery,
  useExportInvoiceMutation,
  useInvoicePromptPayQrQuery,
  useRecordPaymentMutation,
  useVoidInvoiceMutation,
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

describe("sales queries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("useCustomersQuery autocompletes customers by name/tax_id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("/customers")) {
          return Promise.resolve(
            jsonResponse({
              data: [
                {
                  id: "c1",
                  name: "Siam Garments Co.",
                  tax_id: "0105561000001",
                  branch_code: "00000",
                  addresses: [],
                  credit_terms_days: 30,
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
      const { data } = useCustomersQuery({ search: "Siam" });
      const customer = data?.body.data[0];
      return <div>{customer ? customer.name : "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("Siam Garments Co.")).toBeInTheDocument();
  });

  it("useRecordPaymentMutation issues a receipt on a full payment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              payment: {
                id: "p1",
                invoice_id: "inv1",
                amount: "1000.00",
                method: "TRANSFER",
                promptpay_ref: null,
                paid_at: "2026-07-19T00:00:00.000Z",
              },
              receipt: {
                id: "r1",
                doc_no: "RC-0001",
                invoice_id: "inv1",
                type: "TAX_INVOICE",
                paid_at: "2026-07-19T00:00:00.000Z",
              },
            },
            201,
          ),
        ),
      ),
    );

    function Harness() {
      const record = useRecordPaymentMutation();
      return (
        <div>
          <button
            onClick={() =>
              record.mutate({
                params: { id: "inv1" },
                body: { amount: "1000.00", method: "TRANSFER" },
              })
            }
          >
            Record
          </button>
          {record.data?.status === 201 ? <div>{record.data.body.receipt?.doc_no}</div> : null}
        </div>
      );
    }

    renderWithClient(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Record" }));

    expect(await screen.findByText("RC-0001")).toBeInTheDocument();
  });

  it("useVoidInvoiceMutation surfaces the 409 guard when a receipt already exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            { code: "STATE_CONFLICT", message: "Cannot void: a receipt already exists", details: [] },
            409,
          ),
        ),
      ),
    );

    function Harness() {
      const voidInvoice = useVoidInvoiceMutation();
      return (
        <div>
          <button onClick={() => voidInvoice.mutate({ params: { id: "inv1" }, body: { reason: "duplicate" } })}>
            Void
          </button>
          {voidInvoice.isError ? <div>blocked</div> : null}
        </div>
      );
    }

    renderWithClient(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Void" }));

    expect(await screen.findByText("blocked")).toBeInTheDocument();
  });

  it("useInvoicePromptPayQrQuery reads the QR payload for an issued invoice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(jsonResponse({ payload: "00020101...", png_base64: "iVBORw0KGgo=" })),
      ),
    );

    function Harness() {
      const { data } = useInvoicePromptPayQrQuery("inv1");
      return <div>{data?.body.payload ?? "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("00020101...")).toBeInTheDocument();
  });

  it("useExportInvoiceMutation wraps the GET export route as a mutation and resolves the job id", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ job_id: "job1" }, 202))));

    function Harness() {
      const exportInvoice = useExportInvoiceMutation();
      return (
        <div>
          <button onClick={() => exportInvoice.mutate({ id: "inv1", format: "pdf" })}>Export</button>
          {exportInvoice.data ? <div>{exportInvoice.data.job_id}</div> : null}
        </div>
      );
    }

    renderWithClient(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(await screen.findByText("job1")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  });

  it("useAgingReportQuery reads credit-terms aging buckets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            rows: [
              {
                customer_id: "c1",
                customer_name: "Siam Garments Co.",
                current: "0.00",
                d1_30: "500.00",
                d31_60: "0.00",
                d61_90: "0.00",
                over_90: "0.00",
              },
            ],
          }),
        ),
      ),
    );

    function Harness() {
      const { data } = useAgingReportQuery();
      return <div>{data?.body.rows[0]?.d1_30 ?? "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("500.00")).toBeInTheDocument();
  });
});
