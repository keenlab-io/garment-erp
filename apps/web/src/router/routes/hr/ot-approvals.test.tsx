import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { ToastProvider } from "@erp/ui";
import i18n from "../../../i18n/i18n";
import { OtApprovalsPage } from "./ot-approvals";

// `useDensity` reads router matches for kiosk detection; the page only needs the resolved value.
vi.mock("../../../density/density-context", () => ({
  useDensity: () => ({ density: "comfortable" }),
}));

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

const OT_REQUEST = {
  id: "11111111-1111-1111-1111-111111111111",
  employee_id: "22222222-2222-2222-2222-222222222222",
  work_date: "2026-07-20",
  start_time: "18:00",
  end_time: "20:00",
  reason: "Rush order",
  rate_type: "OT_1_5",
  approved_hours: null,
  status: "SUBMITTED",
  approver_id: null,
  version: 0,
};

const EMPLOYEE = { id: OT_REQUEST.employee_id, first_name: "Somchai", last_name: "Jaidee" };

function stubHappyPath() {
  stubFetch((url) => {
    if (url.includes("/ot-requests")) return jsonResponse({ ot_requests: [OT_REQUEST] });
    if (url.includes("/employees")) return jsonResponse({ data: [EMPLOYEE], next_cursor: null });
    return undefined;
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <OtApprovalsPage />
        </ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("OtApprovalsPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Regression: `detail = requests.find(...)` is `OtRequest | undefined`, never `null`. The drawer
  // was gated on `detail !== null`, so `undefined !== null` opened a modal on mount — its Radix
  // overlay + focus trap froze the page ("cannot click anything, keeps spinning").
  it("does not open the detail drawer on mount", async () => {
    stubHappyPath();
    renderPage();

    expect(await screen.findByText("Somchai Jaidee")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the detail drawer only after choosing View, and closes it again", async () => {
    stubHappyPath();
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Somchai Jaidee");
    await user.click((await screen.findAllByRole("button", { name: "Row actions" }))[0]!);
    await user.click(await screen.findByRole("button", { name: "View" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
