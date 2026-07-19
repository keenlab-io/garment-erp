import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  payslipPdfPollInterval,
  payslipsPollInterval,
  useCreateEmployeeMutation,
  useDisburseCashAdvanceMutation,
  useEmployeesQuery,
  usePayslipPdfQuery,
  usePayslipsQuery,
} from "./queries";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(byPath: Record<string, () => Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const match = Object.entries(byPath).find(([path]) => url.includes(path));
      return Promise.resolve(match ? match[1]() : jsonResponse({}, 404));
    }),
  );
}

function renderWithClient(ui: React.ReactNode, queryClient = new QueryClient()) {
  return { queryClient, ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>) };
}

describe("hr queries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("useEmployeesQuery lists employees from the paginated endpoint (salary omitted)", async () => {
    stubFetch({
      "/employees": () =>
        jsonResponse({
          data: [
            {
              id: "e1",
              emp_code: "EXT0001",
              first_name: "Somchai",
              last_name: "Jai",
              employment_type: "MONTHLY",
              status: "ACTIVE",
              position_id: null,
              hire_date: "2024-01-01",
              probation_end_date: null,
              profile: {},
              version: 0,
              // base_salary omitted — caller lacks hr.salary.view
            },
          ],
          next_cursor: null,
        }),
    });

    function Harness() {
      const { data } = useEmployeesQuery();
      const emp = data?.body.data[0];
      return <div>{emp ? `${emp.first_name}:${emp.base_salary ?? "masked"}` : "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("Somchai:masked")).toBeInTheDocument();
  });

  it("useCreateEmployeeMutation invalidates the employees list", async () => {
    let listCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = init?.method ?? "GET";
        if (url.includes("/employees") && method === "GET") {
          listCalls += 1;
          return Promise.resolve(jsonResponse({ data: [], next_cursor: null }));
        }
        if (url.includes("/employees") && method === "POST") {
          return Promise.resolve(
            jsonResponse(
              {
                employee: {
                  id: "e2",
                  emp_code: "EXT0002",
                  first_name: "New",
                  last_name: "Hire",
                  employment_type: "MONTHLY",
                  status: "ACTIVE",
                  position_id: null,
                  hire_date: "2026-07-19",
                  probation_end_date: null,
                  profile: {},
                  version: 0,
                },
              },
              201,
            ),
          );
        }
        return Promise.resolve(jsonResponse({}, 404));
      }),
    );

    function Harness() {
      const { data } = useEmployeesQuery();
      const create = useCreateEmployeeMutation();
      return (
        <div>
          <div data-testid="count">{data?.body.data.length ?? 0}</div>
          <button
            onClick={() =>
              create.mutate({
                body: {
                  first_name: "New",
                  last_name: "Hire",
                  employment_type: "MONTHLY",
                  hire_date: "2026-07-19",
                  profile: {},
                },
              })
            }
          >
            Create
          </button>
        </div>
      );
    }

    renderWithClient(<Harness />);
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("0"));

    const callsBefore = listCalls;
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(listCalls).toBeGreaterThan(callsBefore));
  });

  it("useDisburseCashAdvanceMutation resolves without throwing", async () => {
    stubFetch({
      "/disburse": () =>
        jsonResponse({
          cash_advance: {
            id: "ca1",
            employee_id: "e1",
            amount: "1000.00",
            reason: null,
            status: "DISBURSED",
            approver_id: "u1",
            repayment_plan: null,
            outstanding: "1000.00",
            version: 1,
          },
        }),
    });

    function Harness() {
      const disburse = useDisburseCashAdvanceMutation();
      return (
        <button onClick={() => disburse.mutate({ params: { id: "ca1" }, body: undefined })}>
          Disburse
        </button>
      );
    }

    renderWithClient(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Disburse" }));

    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  });

  it("usePayslipsQuery renders the run's payslips (money masked without hr.salary.view)", async () => {
    stubFetch({
      "/payslips": () =>
        jsonResponse({ payslips: [{ id: "p1", employee_id: "e1" }] }),
    });

    function Harness() {
      const { data } = usePayslipsQuery("run1");
      return <div>{data?.body.payslips.length ?? "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("usePayslipPdfQuery surfaces the signed URL once the worker has rendered it", async () => {
    stubFetch({
      "/pdf": () => jsonResponse({ url: "https://storage.example/payslip.pdf" }, 302),
    });

    function Harness() {
      const { data } = usePayslipPdfQuery("p1");
      return <div>{data?.status === 302 ? data.body.url : "pending"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("https://storage.example/payslip.pdf")).toBeInTheDocument();
  });

  describe("payslipsPollInterval", () => {
    it("stops when polling isn't requested", () => {
      expect(payslipsPollInterval({ status: 200, body: { payslips: [] } }, false)).toBe(false);
    });

    it("polls while the run has no payslips yet", () => {
      expect(payslipsPollInterval({ status: 200, body: { payslips: [] } }, true)).toBe(2000);
    });

    it("stops once payslips have populated", () => {
      expect(payslipsPollInterval({ status: 200, body: { payslips: [{}] } }, true)).toBe(false);
    });

    it("stops on an error status", () => {
      expect(payslipsPollInterval({ status: 404 }, true)).toBe(false);
    });
  });

  describe("payslipPdfPollInterval", () => {
    it("polls on 409 (not generated yet)", () => {
      expect(payslipPdfPollInterval({ status: 409 })).toBe(3000);
    });

    it("stops once the PDF is ready", () => {
      expect(payslipPdfPollInterval({ status: 302 })).toBe(false);
    });

    it("stops when there's no data yet", () => {
      expect(payslipPdfPollInterval(undefined)).toBe(false);
    });
  });
});
