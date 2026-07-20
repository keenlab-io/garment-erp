import { describe, it, expect, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderInShell, userWith, superAdmin } from "../test/render";
import { MODULES, MODULE_CHILDREN } from "../nav/registry";
import { NavGroup } from "./NavGroup";

const inventory = MODULES.find((m) => m.key === "inventory")!;
const items = MODULE_CHILDREN.inventory!;

describe("NavGroup", () => {
  it("is collapsed when the active route is elsewhere, and expands on click", async () => {
    const { container } = await renderInShell(<NavGroup module={inventory} items={items} />, {
      user: superAdmin,
    });
    const header = container.querySelector('[data-nav-group="inventory"]')!;
    expect(header).toBeInTheDocument();
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector('a[href="/inventory/items"]')).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector('a[href="/inventory/items"]')).toBeInTheDocument();
  });

  it("auto-opens when the active route is inside the module", async () => {
    const { container } = await renderInShell(<NavGroup module={inventory} items={items} />, {
      user: superAdmin,
      path: "/inventory/items",
    });
    expect(container.querySelector('[data-nav-group="inventory"]')).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(container.querySelector('a[href="/inventory/items"]')).toBeInTheDocument();
  });

  it("shows only the children the user can access", async () => {
    const { container } = await renderInShell(<NavGroup module={inventory} items={items} />, {
      user: userWith(["inventory.receipt.manage"]),
    });
    fireEvent.click(container.querySelector('[data-nav-group="inventory"]')!);
    expect(container.querySelector('a[href="/inventory/receipts"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/inventory/items"]')).not.toBeInTheDocument();
  });

  it("renders nothing when the user can access none of the children", async () => {
    const { container } = await renderInShell(<NavGroup module={inventory} items={items} />, {
      user: userWith(["sales.invoice.create"]),
    });
    expect(container.querySelector('[data-nav-group="inventory"]')).not.toBeInTheDocument();
  });

  it("calls onNavigate when a child link is followed (so the mobile drawer closes)", async () => {
    const onNavigate = vi.fn();
    const { container } = await renderInShell(
      <NavGroup module={inventory} items={items} onNavigate={onNavigate} />,
      { user: superAdmin, path: "/inventory/items" },
    );
    fireEvent.click(container.querySelector('a[href="/inventory/receipts"]')!);
    expect(onNavigate).toHaveBeenCalled();
  });
});
