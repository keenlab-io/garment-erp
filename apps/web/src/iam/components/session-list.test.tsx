import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionList, type SessionRow } from "./session-list";

const SESSIONS: SessionRow[] = [
  {
    id: "s1",
    device: "Chrome on Windows",
    ipAddress: "10.0.0.1",
    createdAt: "2026-07-01T00:00:00.000Z",
    lastActiveAt: "2026-07-18T10:00:00.000Z",
    current: true,
  },
  {
    id: "s2",
    device: "Safari on iPhone",
    ipAddress: "10.0.0.2",
    createdAt: "2026-07-10T00:00:00.000Z",
    lastActiveAt: "2026-07-17T09:00:00.000Z",
  },
];

describe("SessionList", () => {
  it("shows the empty state with no sessions", () => {
    render(<SessionList sessions={[]} onRevoke={() => {}} />);
    expect(screen.getByText("No active sessions.")).toBeInTheDocument();
  });

  it("renders a row per session with device/IP and marks the current one", () => {
    render(<SessionList sessions={SESSIONS} onRevoke={() => {}} />);

    expect(screen.getByText("Chrome on Windows")).toBeInTheDocument();
    expect(screen.getByText("Safari on iPhone")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("disables revoke for the current session but not for others", () => {
    render(<SessionList sessions={SESSIONS} onRevoke={() => {}} />);
    const revokeButtons = screen.getAllByRole("button", { name: "Revoke" });
    expect(revokeButtons[0]).toBeDisabled();
    expect(revokeButtons[1]).toBeEnabled();
  });

  it("calls onRevoke with the row's session when clicked", async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();
    render(<SessionList sessions={SESSIONS} onRevoke={onRevoke} />);

    await user.click(screen.getAllByRole("button", { name: "Revoke" })[1]!);
    expect(onRevoke).toHaveBeenCalledWith(SESSIONS[1]);
  });
});
