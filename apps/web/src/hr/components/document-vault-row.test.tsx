import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { DocumentVaultRow } from "./document-vault-row";

const DOCUMENT = {
  id: "d1",
  type: "ID_CARD" as const,
  fileName: "national-id.pdf",
  uploadedAt: "2026-06-01T09:00:00.000Z",
};

describe("DocumentVaultRow", () => {
  it("shows the file name and upload date, never an inline preview", () => {
    render(<DocumentVaultRow document={DOCUMENT} onDownload={() => {}} />);
    expect(screen.getByText("national-id.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /national-id/i })).not.toBeInTheDocument();
  });

  it("requests a fresh download when clicked", async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    render(<DocumentVaultRow document={DOCUMENT} onDownload={onDownload} />);

    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("shows the loading state while downloading", () => {
    render(<DocumentVaultRow document={DOCUMENT} onDownload={() => {}} downloading />);
    expect(screen.getByRole("button", { name: "Download" })).toHaveAttribute("aria-busy", "true");
  });
});
