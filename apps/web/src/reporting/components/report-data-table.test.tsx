import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { ToastProvider } from "@erp/ui";
import type { ReportColumn, ReportRow } from "@erp/contracts";
import i18n from "../../i18n/i18n";
import { buildReportColumns, reportTotalsEntries, ReportDataTable } from "./report-data-table";

const COLUMNS: ReportColumn[] = [
  { key: "d", label: "Date" },
  { key: "sales", label: "Sales" },
];
const ROWS: ReportRow[] = [
  { d: "2026-01-01", sales: 1000 },
  { d: "2026-01-02", sales: 2500.5 },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient();
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("buildReportColumns", () => {
  it("marks a column with only numeric values for right alignment", () => {
    const cols = buildReportColumns(COLUMNS, ROWS);
    expect(cols.find((c) => c.id === "sales")?.meta?.align).toBe("right");
  });

  it("marks a column with non-numeric values for left alignment", () => {
    const cols = buildReportColumns(COLUMNS, ROWS);
    expect(cols.find((c) => c.id === "d")?.meta?.align).toBe("left");
  });
});

describe("reportTotalsEntries", () => {
  it("pairs each column's label with its formatted total", () => {
    const entries = reportTotalsEntries(COLUMNS, { sales: 3500.5 });
    expect(entries).toEqual([{ key: "sales", label: "Sales", value: "3,500.5" }]);
  });

  it("drops totals for keys the column catalog doesn't name", () => {
    const entries = reportTotalsEntries(COLUMNS, { unknown: "1" });
    expect(entries).toEqual([]);
  });
});

describe("ReportDataTable", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders report rows through the shared DataTable", () => {
    renderWithProviders(
      <ReportDataTable columns={COLUMNS} rows={ROWS} reportKey="sales.overview" />,
    );
    expect(screen.getByText("2026-01-01")).toBeInTheDocument();
    expect(screen.getByText("2,500.5")).toBeInTheDocument();
  });

  it("shows a totals strip that reconciles with the rows", () => {
    renderWithProviders(
      <ReportDataTable columns={COLUMNS} rows={ROWS} totals={{ sales: "3500.5" }} reportKey="sales.overview" />,
    );
    expect(screen.getByText("3,500.5")).toBeInTheDocument();
  });

  it("calls onDrillDown with the row when its row action is clicked", async () => {
    const user = userEvent.setup();
    const onDrillDown = vi.fn();
    renderWithProviders(
      <ReportDataTable columns={COLUMNS} rows={ROWS} reportKey="sales.overview" onDrillDown={onDrillDown} />,
    );
    await user.click(screen.getAllByRole("button", { name: "Row actions" })[0]!);
    await user.click(await screen.findByText("View detail"));
    expect(onDrillDown).toHaveBeenCalledWith(ROWS[0]);
  });

  it("runs an export job and resolves the job toast once it's done", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = init?.method ?? "GET";
        if (url.includes("/reports/sales.overview/export") && method === "POST") {
          return Promise.resolve(jsonResponse({ job_id: "job1" }, 202));
        }
        if (url.includes("/exports/job1")) {
          // A small delay so the pending job-toast is observably rendered before it resolves,
          // instead of racing the mutation's own resolution within the same microtask flush.
          return new Promise((resolve) =>
            setTimeout(
              () => resolve(jsonResponse({ status: "DONE", file_url: "https://storage.example/report.pdf" })),
              20,
            ),
          );
        }
        return Promise.resolve(jsonResponse({}, 404));
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<ReportDataTable columns={COLUMNS} rows={ROWS} reportKey="sales.overview" />);

    await user.click(screen.getByRole("button", { name: "PDF" }));
    expect(await screen.findByText("Generating PDF export…")).toBeInTheDocument();
    expect(await screen.findByText("Export ready")).toBeInTheDocument();
    expect(screen.getByText("Download")).toBeInTheDocument();
  });
});
