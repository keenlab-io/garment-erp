import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { ToastProvider } from "@erp/ui";
import i18n from "../../../i18n/i18n";
import { SessionProvider } from "../../../session/session-context";
import type { AuthUser } from "../../../session/dev-user";
import { OrgStructurePage } from "./org-structure";

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

const DEPARTMENT = { id: "33333333-3333-3333-3333-333333333333", name: "Sewing", parent_id: null };
const POSITION = {
  id: "44444444-4444-4444-4444-444444444444",
  title: "Line supervisor",
  job_description: null,
  department_id: DEPARTMENT.id,
};

function stubHappyPath() {
  stubFetch((url, init) => {
    const method = init?.method ?? "GET";
    if (url.includes("/positions")) {
      if (method === "POST") return jsonResponse({ position: { ...POSITION, id: "new-position" } }, 201);
      return jsonResponse({ positions: [POSITION] });
    }
    if (url.includes("/departments")) {
      if (method === "POST") return jsonResponse({ department: { ...DEPARTMENT, id: "new-department" } }, 201);
      return jsonResponse({ departments: [DEPARTMENT] });
    }
    return undefined;
  });
}

function stubNoDepartments() {
  stubFetch((url, init) => {
    const method = init?.method ?? "GET";
    if (url.includes("/positions")) {
      if (method === "POST") return jsonResponse({ position: POSITION }, 201);
      return jsonResponse({ positions: [] });
    }
    if (url.includes("/departments")) {
      if (method === "POST") return jsonResponse({ department: DEPARTMENT }, 201);
      return jsonResponse({ departments: [] });
    }
    return undefined;
  });
}

const MANAGER: AuthUser = {
  id: "u1",
  name: "Manager",
  email: "m@example.com",
  isSuperAdmin: true,
  permissions: [],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider initialUser={MANAGER}>
          <ToastProvider>
            <OrgStructurePage />
          </ToastProvider>
        </SessionProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("OrgStructurePage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders both sections with resolved names", async () => {
    stubHappyPath();
    renderPage();

    await screen.findByText("Line supervisor");
    const positionRow = screen.getByText("Line supervisor").closest("tr")!;
    expect(within(positionRow).getByText("Sewing")).toBeInTheDocument();

    // The department itself shows up as a row too (name "Sewing", no parent).
    expect(screen.getAllByText("Sewing")).toHaveLength(2);
  });

  it("creates a position", async () => {
    const calls: unknown[] = [];
    stubFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/positions")) {
        if (method === "POST") {
          calls.push(init?.body ? JSON.parse(init.body as string) : undefined);
          return jsonResponse({ position: { ...POSITION, id: "new-position" } }, 201);
        }
        return jsonResponse({ positions: [POSITION] });
      }
      if (url.includes("/departments")) {
        return jsonResponse({ departments: [DEPARTMENT] });
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Line supervisor");
    await user.click(screen.getByRole("button", { name: "New position" }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText(/^Title/), "Cutter");
    await user.click(within(dialog).getByRole("combobox", { name: "Department" }));
    await user.click(await screen.findByRole("option", { name: "Sewing" }));
    await user.click(within(dialog).getByRole("button", { name: "New position" }));

    await waitFor(() => expect(calls).toEqual([{ title: "Cutter", department_id: DEPARTMENT.id }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("first-run: hints to create a department first, then switches to the department drawer", async () => {
    stubNoDepartments();

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "New position" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("You need a department before you can add a position."),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Create a department first" }));

    await waitFor(() => {
      expect(
        within(screen.getByRole("dialog")).getByRole("heading", { name: "New department" }),
      ).toBeInTheDocument();
    });
  });

  it("creates a department", async () => {
    const calls: unknown[] = [];
    stubFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/positions")) return jsonResponse({ positions: [POSITION] });
      if (url.includes("/departments")) {
        if (method === "POST") {
          calls.push(init?.body ? JSON.parse(init.body as string) : undefined);
          return jsonResponse({ department: { ...DEPARTMENT, id: "new-department" } }, 201);
        }
        return jsonResponse({ departments: [DEPARTMENT] });
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "New department" }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText(/^Name/), "Cutting");
    await user.click(within(dialog).getByRole("button", { name: "New department" }));

    await waitFor(() => expect(calls).toEqual([{ name: "Cutting" }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
