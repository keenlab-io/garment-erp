import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { ToastProvider } from "@erp/ui";
import i18n from "../../../i18n/i18n";
import { CreateOtRequestDrawer } from "./ot-request-create-drawer";

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

const EMPLOYEE = { id: "22222222-2222-2222-2222-222222222222", first_name: "Somchai", last_name: "Jaidee" };
const DRAFT = {
  id: "11111111-1111-1111-1111-111111111111",
  employee_id: EMPLOYEE.id,
  work_date: "2026-07-20",
  start_time: "18:00",
  end_time: "20:00",
  reason: null,
  rate_type: "WEEKDAY_1_5",
  approved_hours: null,
  status: "DRAFT",
  approver_id: null,
  version: 0,
};

function renderDrawer(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <CreateOtRequestDrawer open onOpenChange={onOpenChange} />
        </ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { onOpenChange };
}

async function pickEmployee(user: ReturnType<typeof userEvent.setup>) {
  // Two controls resolve to role "combobox" in this drawer (the employee Combobox and the
  // Radix Select rate-type trigger both render role="combobox"), so disambiguate by name.
  // Likewise the popover's search input and the Reason field are both role "textbox".
  await user.click(screen.getByRole("combobox", { name: "Employee" }));
  await user.type(screen.getByRole("textbox", { name: "Search…" }), "som");
  await user.click(await screen.findByRole("option", { name: "Somchai Jaidee" }));
}

describe("CreateOtRequestDrawer", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates then submits an OT request, toasts, and closes", async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/employees") && method === "GET") return jsonResponse({ data: [EMPLOYEE], next_cursor: null });
      if (url.endsWith("/ot-requests") && method === "POST") {
        calls.push("create");
        return jsonResponse({ ot_request: DRAFT }, 201);
      }
      if (url.includes("/ot-requests/") && url.endsWith("/submit") && method === "POST") {
        calls.push("submit");
        return jsonResponse({ ot_request: { ...DRAFT, status: "SUBMITTED" } });
      }
      return undefined;
    });

    const user = userEvent.setup();
    const { onOpenChange } = renderDrawer();

    await pickEmployee(user);
    await user.type(screen.getByLabelText(/^Work date/), "2026-07-20");
    await user.type(screen.getByLabelText(/^Start time/), "18:00");
    await user.type(screen.getByLabelText(/^End time/), "20:00");
    await user.click(screen.getByRole("button", { name: "Submit for approval" }));

    await waitFor(() => expect(calls).toEqual(["create", "submit"]));
    expect(await screen.findByText("OT request submitted for approval.")).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a create error and does not submit when create fails", async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/employees") && method === "GET") return jsonResponse({ data: [EMPLOYEE], next_cursor: null });
      if (url.endsWith("/ot-requests") && method === "POST") {
        calls.push("create");
        return jsonResponse({ code: "INTERNAL", message: "boom", details: {} }, 500);
      }
      if (url.endsWith("/submit") && method === "POST") {
        calls.push("submit");
        return jsonResponse({ ot_request: DRAFT });
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderDrawer();

    await pickEmployee(user);
    await user.type(screen.getByLabelText(/^Work date/), "2026-07-20");
    await user.type(screen.getByLabelText(/^Start time/), "18:00");
    await user.type(screen.getByLabelText(/^End time/), "20:00");
    await user.click(screen.getByRole("button", { name: "Submit for approval" }));

    expect(await screen.findByText("Couldn't create the OT request. Please try again.")).toBeInTheDocument();
    expect(calls).toEqual(["create"]);
  });

  it("shows a submit error and, on retry, resumes at submit without re-creating the draft", async () => {
    const calls: string[] = [];
    let submitShouldFail = true;
    stubFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/employees") && method === "GET") return jsonResponse({ data: [EMPLOYEE], next_cursor: null });
      if (url.endsWith("/ot-requests") && method === "POST") {
        calls.push("create");
        return jsonResponse({ ot_request: DRAFT }, 201);
      }
      if (url.includes("/ot-requests/") && url.endsWith("/submit") && method === "POST") {
        calls.push("submit");
        if (submitShouldFail) return jsonResponse({ code: "INTERNAL", message: "boom", details: {} }, 500);
        return jsonResponse({ ot_request: { ...DRAFT, status: "SUBMITTED" } });
      }
      return undefined;
    });

    const user = userEvent.setup();
    const { onOpenChange } = renderDrawer();

    await pickEmployee(user);
    await user.type(screen.getByLabelText(/^Work date/), "2026-07-20");
    await user.type(screen.getByLabelText(/^Start time/), "18:00");
    await user.type(screen.getByLabelText(/^End time/), "20:00");
    await user.click(screen.getByRole("button", { name: "Submit for approval" }));

    expect(
      await screen.findByText("Request created but couldn't be submitted. Please try again."),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(calls).toEqual(["create", "submit"]);

    // Retry: submit now succeeds. The draft must NOT be created a second time.
    submitShouldFail = false;
    await user.click(screen.getByRole("button", { name: "Submit for approval" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(calls).toEqual(["create", "submit", "submit"]);
  });

  it("blocks submit with a validation error when end is not after start", async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/employees") && method === "GET") return jsonResponse({ data: [EMPLOYEE], next_cursor: null });
      if (method === "POST") {
        calls.push("post");
        return jsonResponse({ ot_request: DRAFT }, 201);
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderDrawer();

    await pickEmployee(user);
    await user.type(screen.getByLabelText(/^Work date/), "2026-07-20");
    await user.type(screen.getByLabelText(/^Start time/), "20:00");
    await user.type(screen.getByLabelText(/^End time/), "18:00");
    await user.click(screen.getByRole("button", { name: "Submit for approval" }));

    expect(await screen.findByText("End time must be after the start time.")).toBeInTheDocument();
    expect(calls).toEqual([]);
  });
});
