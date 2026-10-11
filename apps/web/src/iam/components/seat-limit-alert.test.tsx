import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n/i18n";
import { SeatLimitAlert } from "./seat-limit-alert";

const wrap = (error: unknown) =>
  render(
    <I18nextProvider i18n={i18n}>
      <SeatLimitAlert error={error} />
    </I18nextProvider>,
  );

describe("SeatLimitAlert", () => {
  it("renders counts and named users for a seat-limit 422", async () => {
    await i18n.changeLanguage("en");
    wrap({
      status: 422,
      body: {
        code: "BUSINESS_RULE",
        details: [
          { field: "seats", issue: "seat limit reached" },
          { field: "cap", issue: "8" },
          { field: "counted", issue: "8" },
          { field: "exempt", issue: "2" },
          { field: "user:somchai", issue: "would occupy a seat" },
        ],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("8 of 8 seats are in use");
    expect(screen.getByRole("alert")).toHaveTextContent("somchai");
  });

  it("renders nothing for unrelated errors", async () => {
    wrap({ status: 500, body: {} });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
