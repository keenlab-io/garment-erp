import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n/i18n";
import { SunkMessageCard } from "./DemoSunkNotice";
import { DemoDeletionNotice } from "./DemoNotice";

describe("demo labels", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("labels a sunk message as not delivered", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <SunkMessageCard channel="line" to={["U123"]} text="Your order shipped" />
      </I18nextProvider>,
    );
    expect(screen.getByText("demo — not delivered")).toBeTruthy();
    expect(screen.getByText("Your order shipped")).toBeTruthy();
  });

  it("shows the deletion notice", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <DemoDeletionNotice />
      </I18nextProvider>,
    );
    expect(screen.getByRole("note").textContent).toContain("deleted");
  });
});
