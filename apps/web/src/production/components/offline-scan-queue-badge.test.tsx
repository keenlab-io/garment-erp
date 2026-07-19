import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfflineScanQueueBadge } from "./offline-scan-queue-badge";

describe("OfflineScanQueueBadge", () => {
  it("renders nothing when online, idle, and empty", () => {
    const { container } = render(<OfflineScanQueueBadge isOnline queuedCount={0} syncing={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the offline banner with the queued count", () => {
    render(<OfflineScanQueueBadge isOnline={false} queuedCount={3} syncing={false} />);
    expect(screen.getByText("Offline — 3 scans queued")).toBeInTheDocument();
  });

  it("singularizes a single queued scan", () => {
    render(<OfflineScanQueueBadge isOnline={false} queuedCount={1} syncing={false} />);
    expect(screen.getByText("Offline — 1 scan queued")).toBeInTheDocument();
  });

  it("shows the syncing state over a plain queued count", () => {
    render(<OfflineScanQueueBadge isOnline queuedCount={2} syncing />);
    expect(screen.getByText("Syncing 2…")).toBeInTheDocument();
  });

  it("shows a queued count when online but not yet synced", () => {
    render(<OfflineScanQueueBadge isOnline queuedCount={2} syncing={false} />);
    expect(screen.getByText("2 queued")).toBeInTheDocument();
  });
});
