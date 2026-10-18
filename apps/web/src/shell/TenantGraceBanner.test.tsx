import { beforeAll, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import i18n from "../i18n/i18n";
import { LocaleProvider } from "../i18n/locale-context";
import { renderInShell, superAdmin } from "../test/render";
import { TenantGraceBanner, graceDaysLeft } from "./TenantGraceBanner";

const tenantWith = (status: "ACTIVE" | "IN_GRACE", graceEndsAt: string) => ({
  ...superAdmin,
  tenant: {
    id: "t1",
    name: "Acme",
    slug: "acme",
    subscription: { status, term_end: "2026-10-01T00:00:00.000Z", grace_ends_at: graceEndsAt },
  },
});

describe("graceDaysLeft", () => {
  it("rounds up and never goes negative", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(graceDaysLeft("2026-10-16T00:00:00Z", now)).toBe(6);
    expect(graceDaysLeft("2026-10-01T00:00:00Z", now)).toBe(0);
  });
});

describe("TenantGraceBanner", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("counts down the days left while IN_GRACE", async () => {
    await renderInShell(<LocaleProvider><TenantGraceBanner now={new Date("2026-10-10T00:00:00Z")} /></LocaleProvider>, {
      user: tenantWith("IN_GRACE", "2026-10-16T00:00:00Z"),
    });
    expect(screen.getByRole("status")).toHaveTextContent("6 days left");
  });

  it("says renew today on the last day", async () => {
    await renderInShell(<LocaleProvider><TenantGraceBanner now={new Date("2026-10-15T12:00:00Z")} /></LocaleProvider>, {
      user: tenantWith("IN_GRACE", "2026-10-16T00:00:00Z"),
    });
    expect(screen.getByRole("status")).toHaveTextContent("Renew today");
  });

  it("renders nothing for an ACTIVE subscription", async () => {
    await renderInShell(<LocaleProvider><TenantGraceBanner /></LocaleProvider>, {
      user: tenantWith("ACTIVE", "2026-10-16T00:00:00Z"),
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
