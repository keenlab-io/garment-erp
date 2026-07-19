import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuditEntry } from "@erp/contracts";
import { AuditTable } from "./audit-table";

const ENTRIES: AuditEntry[] = [
  {
    id: "a1",
    at: "2026-07-01T00:00:00.000Z",
    actor_user_id: "u1",
    actor_role: "Admin",
    action: "UPDATE",
    entity_type: "role",
    entity_id: "r1",
    before: { name: "Old" },
    after: { name: "New" },
    reason: null,
  },
  {
    id: "a2",
    at: "2026-07-02T00:00:00.000Z",
    actor_user_id: null,
    actor_role: null,
    action: "FORCE_LOGOUT",
    entity_type: "user",
    entity_id: "u2",
    before: null,
    after: null,
    reason: "Suspicious activity",
  },
];

describe("AuditTable", () => {
  it("shows the empty state with no entries", () => {
    render(<AuditTable entries={[]} />);
    expect(screen.getByText("No audit entries.")).toBeInTheDocument();
  });

  it("renders a row per entry with action, entity, and system fallback for a null actor", () => {
    render(<AuditTable entries={ENTRIES} />);

    expect(screen.getByText("UPDATE")).toBeInTheDocument();
    expect(screen.getByText("FORCE_LOGOUT")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Suspicious activity")).toBeInTheDocument();
  });

  it("expands a row to reveal the before/after diff", async () => {
    const user = userEvent.setup();
    render(<AuditTable entries={ENTRIES} />);

    expect(screen.queryByText("Old")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Show details" })[0]!);
    expect(screen.getByText("Old")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("shows an error state with retry", async () => {
    const onRetry = vi.fn();
    render(<AuditTable entries={[]} error={{ message: "boom" }} onRetry={onRetry} />);

    expect(screen.getByText("Couldn't load the audit log.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });
});
