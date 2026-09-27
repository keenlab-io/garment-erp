import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { ToastProvider } from "@erp/ui";
import i18n from "../i18n/i18n";
import { notifyTenantReadOnly, resetTenantReadOnly } from "../api/tenant-status";
import { TenantReadOnlyBanner } from "./TenantReadOnlyBanner";

function renderBanner() {
  return render(
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <TenantReadOnlyBanner />
      </ToastProvider>
    </I18nextProvider>,
  );
}

describe("TenantReadOnlyBanner", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    resetTenantReadOnly();
  });

  it("renders nothing while the tenant is writable", () => {
    renderBanner();
    expect(screen.queryByText(/read-only/)).not.toBeInTheDocument();
  });

  it("shows a persistent banner and a toast once a mutation is refused", async () => {
    renderBanner();

    act(() => notifyTenantReadOnly());

    expect(
      screen.getByText("This workspace is read-only. You can view records, but changes can't be saved right now."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Change not saved")).toBeInTheDocument();
  });

  it("clears the banner when the flag is reset (sign-out)", () => {
    renderBanner();
    act(() => notifyTenantReadOnly());
    act(() => resetTenantReadOnly());

    expect(screen.queryByText(/You can view records/)).not.toBeInTheDocument();
  });
});
