import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PromptPayQrBlock } from "./promptpay-qr-block";

const SAMPLE_QR = { payload: "00020101021129370016A00000067701011101...", png_base64: "iVBORw0KGgo=" };

describe("PromptPayQrBlock", () => {
  it("shows the empty state before the invoice is issued", () => {
    render(<PromptPayQrBlock qr={null} />);
    expect(screen.getByText("Issue the invoice to generate a PromptPay QR")).toBeInTheDocument();
  });

  it("shows a loading skeleton", () => {
    const { container } = render(<PromptPayQrBlock qr={null} loading />);
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("renders the QR image, amount, and payload when issued", () => {
    render(<PromptPayQrBlock qr={SAMPLE_QR} amount="53500.0000" />);
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toContain("data:image/png;base64,iVBORw0KGgo=");
    expect(screen.getByText("฿53,500.00")).toBeInTheDocument();
    expect(screen.getByText(/00020101021129370016A00000067701011101/)).toBeInTheDocument();
  });
});
