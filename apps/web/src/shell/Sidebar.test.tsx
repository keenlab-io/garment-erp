import { describe, it, expect } from "vitest";
import { renderInShell, userWith, superAdmin } from "../test/render";
import { Sidebar } from "./Sidebar";

// Modules with sub-routes render as an expandable group (a `[data-nav-group]` toggle button);
// modules without (Dashboard) stay a plain `<a>`. Assertions key off those stable, language-
// independent hooks so an unpermitted module being *absent* from the DOM is what's verified.
describe("Sidebar", () => {
  it("omits modules the user lacks entirely", async () => {
    const { container } = await renderInShell(<Sidebar />, {
      user: userWith(["inventory.receipt.manage"]),
    });
    expect(container.querySelector('a[href="/"]')).toBeInTheDocument(); // dashboard, ungated link
    expect(container.querySelector('[data-nav-group="inventory"]')).toBeInTheDocument();
    expect(container.querySelector('[data-nav-group="sales"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-nav-group="hr"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-nav-group="admin"]')).not.toBeInTheDocument();
  });

  it("keeps Admin out for a non-super-admin holding every module permission", async () => {
    const { container } = await renderInShell(<Sidebar />, {
      user: userWith(["sales.invoice.create", "iam.role.manage", "hr.employee.view"]),
    });
    expect(container.querySelector('[data-nav-group="sales"]')).toBeInTheDocument();
    expect(container.querySelector('[data-nav-group="hr"]')).toBeInTheDocument();
    // iam.role.manage would grant admin children, but Admin & Access is super-admin only.
    expect(container.querySelector('[data-nav-group="admin"]')).not.toBeInTheDocument();
  });

  it("shows every module, including Admin and Reports, to a super admin", async () => {
    const { container } = await renderInShell(<Sidebar />, { user: superAdmin });
    expect(container.querySelector('[data-nav-group="inventory"]')).toBeInTheDocument();
    expect(container.querySelector('[data-nav-group="sales"]')).toBeInTheDocument();
    expect(container.querySelector('[data-nav-group="reports"]')).toBeInTheDocument();
    expect(container.querySelector('[data-nav-group="admin"]')).toBeInTheDocument();
  });
});
