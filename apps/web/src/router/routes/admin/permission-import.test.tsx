import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../../../i18n/i18n";
import { PermissionImportPage } from "./permission-import";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | undefined) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return Promise.resolve(handler(url, init) ?? jsonResponse({}, 404));
    }),
  );
}

function renderImportPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <PermissionImportPage />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("PermissionImportPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads a file and shows the OK/error row split plus the imported summary", async () => {
    stubFetch((url) =>
      url.includes("/iam/import")
        ? jsonResponse({ imported: 2, skipped: [{ row: 4, reason: "Missing role name" }] })
        : undefined,
    );

    renderImportPage();
    const user = userEvent.setup();
    const file = new File(["role,codes"], "import.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await user.upload(screen.getByLabelText("Browse files"), file);

    expect(await screen.findByText("Imported 2 role(s).")).toBeInTheDocument();
    expect(screen.getAllByText("OK")).toHaveLength(2);
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Missing role name")).toBeInTheDocument();
  });

  it("shows per-row errors and no imported summary when the whole import fails", async () => {
    stubFetch((url) =>
      url.includes("/iam/import")
        ? jsonResponse(
            {
              code: "VALIDATION_ERROR",
              message: "Import contains unknown permission codes",
              details: [{ field: "row 3", issue: "unknown permission code(s): bogus.code" }],
            },
            400,
          )
        : undefined,
    );

    renderImportPage();
    const user = userEvent.setup();
    const file = new File(["role,codes"], "import.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await user.upload(screen.getByLabelText("Browse files"), file);

    expect(await screen.findByText("unknown permission code(s): bogus.code")).toBeInTheDocument();
    expect(screen.queryByText(/Imported \d+ role/)).not.toBeInTheDocument();
  });

  it("re-imports the same file when the primary action is clicked again", async () => {
    let importCalls = 0;
    stubFetch((url) => {
      if (url.includes("/iam/import")) {
        importCalls += 1;
        return jsonResponse({ imported: 1, skipped: [] });
      }
      return undefined;
    });

    renderImportPage();
    const user = userEvent.setup();
    const file = new File(["role,codes"], "import.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await user.upload(screen.getByLabelText("Browse files"), file);
    await waitFor(() => expect(importCalls).toBe(1));

    await user.click(screen.getByRole("button", { name: "Import 1 valid row" }));
    await waitFor(() => expect(importCalls).toBe(2));
  });
});
