import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { ToastProvider } from "@erp/ui";
import i18n from "../../../i18n/i18n";
import { ReportSchedulesPage } from "./report-schedules";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return (await handler(url, init)) ?? jsonResponse({}, 404);
    }),
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ReportSchedulesPage />
        </ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const SCHEDULE = {
  id: "sch1",
  name: "Monday sales digest",
  report_key: "sales.overview",
  cron: "0 8 * * 1",
  recipients: ["owner@example.com"],
  format: "PDF",
  params: {},
  is_active: true,
  version: 0,
};

describe("ReportSchedulesPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists an existing schedule with its friendly cadence", async () => {
    stubFetch((url) => {
      if (url.includes("/report-schedules")) return jsonResponse({ data: [SCHEDULE], next_cursor: null });
      return undefined;
    });

    renderPage();

    expect(await screen.findByText("Monday sales digest")).toBeInTheDocument();
    expect(screen.getByText(/Every Monday 08:00/)).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
  });

  it("creates a new schedule from the form", async () => {
    let created: unknown;
    stubFetch((url, init) => {
      if (url.includes("/report-schedules") && (init?.method ?? "GET") === "GET") {
        return jsonResponse({ data: [], next_cursor: null });
      }
      if (url.endsWith("/report-schedules") && init?.method === "POST") {
        created = JSON.parse(String(init.body));
        return jsonResponse({ schedule: { ...SCHEDULE, id: "new1", name: (created as { name: string }).name } }, 201);
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("No schedules yet.");
    await user.type(screen.getByLabelText("Schedule name"), "Weekly cost digest");
    await user.type(screen.getByPlaceholderText("name@example.com"), "cost@example.com");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    expect(await screen.findByText("Schedule saved")).toBeInTheDocument();
    expect(created).toMatchObject({ name: "Weekly cost digest", recipients: ["cost@example.com"] });
  });

  it("runs a schedule now and resolves the job toast once it's done", async () => {
    stubFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/report-schedules") && method === "GET") {
        return jsonResponse({ data: [SCHEDULE], next_cursor: null });
      }
      if (url.includes("/report-schedules/sch1/run-now") && method === "POST") {
        return jsonResponse({ job_id: "job1" }, 202);
      }
      if (url.includes("/exports/job1")) {
        return new Promise((resolve) => setTimeout(() => resolve(jsonResponse({ status: "DONE" })), 20));
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Run now" }));
    expect(await screen.findByText("Sending \"Monday sales digest\" now…")).toBeInTheDocument();
    expect(await screen.findByText("Digest sent")).toBeInTheDocument();
  });

  it("shows a retry action when a run-now job fails", async () => {
    stubFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/report-schedules") && method === "GET") {
        return jsonResponse({ data: [SCHEDULE], next_cursor: null });
      }
      if (url.includes("/report-schedules/sch1/run-now") && method === "POST") {
        return jsonResponse({ job_id: "job1" }, 202);
      }
      if (url.includes("/exports/job1")) {
        return new Promise((resolve) => setTimeout(() => resolve(jsonResponse({ status: "FAILED" })), 20));
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Run now" }));
    expect(await screen.findByText("Digest send failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("deletes a schedule after confirming", async () => {
    let deleted = false;
    stubFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/report-schedules") && method === "GET") {
        return jsonResponse(deleted ? { data: [], next_cursor: null } : { data: [SCHEDULE], next_cursor: null });
      }
      if (url.includes("/report-schedules/sch1") && method === "DELETE") {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Schedule deleted")).toBeInTheDocument();
  });
});
