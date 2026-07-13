import { describe, it, expect, beforeAll } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../i18n/i18n";
import { renderInShell, userWith } from "../test/render";
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
    expect(screen.getByText("Inventory")).toBeInTheDocument();
    expect(screen.queryByText("Sales")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin & Access")).not.toBeInTheDocument();
  });
});
