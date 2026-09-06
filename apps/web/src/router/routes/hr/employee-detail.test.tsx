import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { ToastProvider } from "@erp/ui";
import i18n from "../../../i18n/i18n";
import { LocaleProvider } from "../../../i18n/locale-context";
import { SessionProvider } from "../../../session/session-context";
import type { AuthUser } from "../../../session/dev-user";
import { EmployeeDetailPage } from "./employee-detail";

const EMPLOYEE_ID = "11111111-1111-1111-1111-111111111111";

// The page reads its id from the route; the tab content is what's under test.
vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ id: EMPLOYEE_ID }),
  Link: ({ children, ...rest }: React.ComponentProps<"a">) => <a {...rest}>{children}</a>,
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const POSITIONS = [
  {
    id: "44444444-4444-4444-4444-444444444444",
    title: "Line supervisor",
    job_description: null,
    department_id: "33333333-3333-3333-3333-333333333333",
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    title: "Cutter",
    job_description: null,
    department_id: "33333333-3333-3333-3333-333333333333",
  },
];

const EMPLOYEE = {
  id: EMPLOYEE_ID,
  emp_code: "EXT0001",
  first_name: "Somchai",
  last_name: "Prasert",
  employment_type: "MONTHLY" as const,
  status: "ACTIVE" as const,
  position_id: POSITIONS[0]!.id,
  hire_date: "2026-01-05",
  probation_end_date: null,
  profile: {},
  version: 3,
};

/** Stubs the reads the Profile tab needs; `onPut` sees the update body and headers. */
function stubFetch(onPut?: (body: unknown, init: RequestInit | undefined) => void) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? "GET";
      if (url.includes("/positions")) return jsonResponse({ positions: POSITIONS });
      if (url.includes("/employees/")) {
        if (method === "PUT") {
          onPut?.(init?.body ? JSON.parse(init.body as string) : undefined, init);
          return jsonResponse({ employee: EMPLOYEE });
        }
        return jsonResponse({ employee: EMPLOYEE });
      }
      return jsonResponse({}, 404);
    }),
  );
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
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider initialUser={MANAGER}>
            <ToastProvider>
              <EmployeeDetailPage />
            </ToastProvider>
          </SessionProvider>
        </QueryClientProvider>
      </LocaleProvider>
    </I18nextProvider>,
  );
}

describe("EmployeeDetailPage — profile position", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the employee's current position title", async () => {
    stubFetch();
    renderPage();

    await screen.findByText("EXT0001");
    await waitFor(() => expect(screen.getByText("Line supervisor")).toBeInTheDocument());
  });

  it("reassigns the position through the edit form", async () => {
    const puts: unknown[] = [];
    stubFetch((body) => puts.push(body));

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("EXT0001");
    await user.click(screen.getByRole("button", { name: "Edit" }));

    const combobox = await screen.findByRole("combobox", { name: "Position" });
    expect(combobox).toHaveTextContent("Line supervisor");

    await user.click(combobox);
    await user.click(await screen.findByRole("option", { name: "Cutter" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ position_id: POSITIONS[1]!.id });
  });

  it("clears the position when 'No position' is picked", async () => {
    const puts: unknown[] = [];
    stubFetch((body) => puts.push(body));

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("EXT0001");
    await user.click(screen.getByRole("button", { name: "Edit" }));

    await user.click(await screen.findByRole("combobox", { name: "Position" }));
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByRole("option", { name: "No position" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ position_id: null });
  });
});
