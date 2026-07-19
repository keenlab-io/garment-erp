import * as React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WhtNetToReceivePanel } from "./wht-net-to-receive-panel";

describe("WhtNetToReceivePanel", () => {
  it("shows 'No withholding' with no rate", () => {
    render(<WhtNetToReceivePanel subtotal="100000.0000" vatAmount="0.0000" grandTotal="100000.0000" />);
    expect(screen.getByText("No withholding")).toBeInTheDocument();
  });

  it("shows the WHT deduction and highlighted net-to-receive at 3%", () => {
    render(
      <WhtNetToReceivePanel subtotal="100000.0000" vatAmount="0.0000" grandTotal="100000.0000" whtRate="0.03" />,
    );
    expect(screen.getByText("(฿3,000.00)")).toBeInTheDocument();
    expect(screen.getByText("Net to receive")).toBeInTheDocument();
    expect(screen.getByText("฿97,000.00")).toBeInTheDocument();
  });

  it("recomputes live as an editable rate changes", () => {
    function Harness() {
      const [rate, setRate] = React.useState("0.03");
      return (
        <WhtNetToReceivePanel
          subtotal="100000.0000"
          vatAmount="0.0000"
          grandTotal="100000.0000"
          whtRate={rate}
          onWhtRateChange={setRate}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByText("฿97,000.00")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("WHT rate"), { target: { value: "0.05" } });
    expect(screen.getByText("฿95,000.00")).toBeInTheDocument();
  });
});
