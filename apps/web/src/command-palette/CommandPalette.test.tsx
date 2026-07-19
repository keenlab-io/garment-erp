import { describe, it, expect, beforeAll } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../i18n/i18n";
import { renderInShell, userWith, superAdmin } from "../test/render";
import { CommandPaletteProvider } from "./command-context";
import { CommandPalette } from "./CommandPalette";
import { useCommandKeymap } from "./useCommandKeymap";

function Host() {
  useCommandKeymap();
  return <CommandPalette />;
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("CommandPalette", () => {
  it("opens on Ctrl/Cmd-K and offers only permitted modules", async () => {
    const user = userEvent.setup();
    await renderInShell(
      <CommandPaletteProvider>
        <Host />
      </CommandPaletteProvider>,
      { user: userWith(["inventory.receipt.manage"]) },
    );

    await user.keyboard("{Control>}k{/Control}");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // "Inventory" appears twice — the "Go to" module entry and this group's own heading (the user
    // holds `inventory.receipt.manage`, which reveals the Goods receipts sub-route) — so assert via
    // the option role rather than text (which would ambiguously match both).
    expect(screen.getByRole("option", { name: "Inventory" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Goods receipts" })).toBeInTheDocument();
    expect(screen.queryByText("Sales")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin & Access")).not.toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
  });

  it("offers the Admin & Access sub-routes to a super admin", async () => {
    const user = userEvent.setup();
    await renderInShell(
      <CommandPaletteProvider>
        <Host />
      </CommandPaletteProvider>,
      { user: superAdmin },
    );

    await user.keyboard("{Control>}k{/Control}");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // "Admin & Access" appears twice — the "Go to" module entry and this group's own heading —
    // so assert via the option role rather than text (which would ambiguously match both).
    expect(screen.getByRole("option", { name: "Admin & Access" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Roles" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Audit log" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Import" })).toBeInTheDocument();
  });

  it("offers only the HR & Payroll sub-routes the user's hr permission grants", async () => {
    const user = userEvent.setup();
    await renderInShell(
      <CommandPaletteProvider>
        <Host />
      </CommandPaletteProvider>,
      { user: userWith(["hr.ot.approve"]) },
    );

    await user.keyboard("{Control>}k{/Control}");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "OT requests" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Employees" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Payroll" })).not.toBeInTheDocument();
  });

  it("offers only the Production Tracking sub-routes the user's production permission grants", async () => {
    const user = userEvent.setup();
    await renderInShell(
      <CommandPaletteProvider>
        <Host />
      </CommandPaletteProvider>,
      { user: userWith(["production.scan"]) },
    );

    await user.keyboard("{Control>}k{/Control}");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Scan station" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Timeline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Subcontracts" })).not.toBeInTheDocument();
  });
});
