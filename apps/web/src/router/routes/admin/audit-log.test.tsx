import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../../../i18n/i18n";
import { LocaleProvider } from "../../../i18n/locale-context";
import { AuditLogPage } from "./audit-log";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(handler: (url: string) => Response | undefined) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return Promise.resolve(handler(url) ?? jsonResponse({}, 404));
    }),
  );
}

async function renderAuditLog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <AuditLogPage />
        </LocaleProvider>
      </QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

const ENTRY = {
  id: "a1",
  at: "2026-07-01T00:00:00.000Z",
  actor_user_id: "u1",
  actor_role: "Admin",
  action: "PERMISSION_CHANGE",
  entity_type: "role",
  entity_id: "r1",
  before: { permission_codes: ["iam.user.manage"] },
  after: { permission_codes: ["iam.user.manage", "iam.role.manage"] },
  reason: null,
};

describe("AuditLogPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders audit entries", async () => {
    stubFetch((url) => (url.includes("/audit") ? jsonResponse({ data: [ENTRY], next_cursor: null }) : undefined));

    await renderAuditLog();

    expect(await screen.findByText("PERMISSION_CHANGE")).toBeInTheDocument();
  });

  it("re-queries with the entity type filter applied", async () => {
    const seenUrls: string[] = [];
    stubFetch((url) => {
      if (url.includes("/audit")) {
        seenUrls.push(url);
        return jsonResponse({ data: [], next_cursor: null });
      }
      return undefined;
    });

    await renderAuditLog();
    const user = userEvent.setup();

    await screen.findByText("No audit entries match these filters.");
    await user.type(screen.getByLabelText("Entity type"), "role");

    await waitFor(() => expect(seenUrls.some((u) => u.includes("entity_type=role"))).toBe(true));
  });
});
