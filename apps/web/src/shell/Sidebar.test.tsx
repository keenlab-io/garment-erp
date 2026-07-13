import { describe, it, expect } from "vitest";
import { renderInShell, userWith, superAdmin } from "../test/render";
import { Sidebar } from "./Sidebar";

// Assertions key off the link href (language-independent) so an unpermitted module being *absent*
// from the DOM — not merely hidden — is what's verified.
describe("Sidebar", () => {
  it("omits modules the user lacks entirely", async () => {
    const { container } = await renderInShell(<Sidebar />, {
      user: userWith(["inventory.receipt.manage"]),
    });
    expect(container.querySelector('a[href="/"]')).toBeInTheDocument(); // dashboard, ungated
    expect(container.querySelector('a[href="/inventory"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/sales"]')).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/hr"]')).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/admin"]')).not.toBeInTheDocument();
  });

  it("keeps Admin out for a non-super-admin holding every module permission", async () => {
    const { container } = await renderInShell(<Sidebar />, {
      user: userWith(["sales.invoice.create", "iam.role.manage", "hr.employee.view"]),
    });
    expect(container.querySelector('a[href="/sales"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/admin"]')).not.toBeInTheDocument();
  });

  it("shows every module, including Admin, to a super admin", async () => {
    const { container } = await renderInShell(<Sidebar />, { user: superAdmin });
    expect(container.querySelector('a[href="/sales"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/admin"]')).toBeInTheDocument();
  });
});
