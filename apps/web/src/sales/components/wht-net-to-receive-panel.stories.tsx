import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WhtNetToReceivePanel } from "./wht-net-to-receive-panel";

const meta = {
  title: "Sales/WhtNetToReceivePanel",
  component: WhtNetToReceivePanel,
  args: { subtotal: "100000.0000", vatAmount: "0.0000", grandTotal: "100000.0000" },
  parameters: { layout: "padded" },
} satisfies Meta<typeof WhtNetToReceivePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoWithholding: Story = {};

export const WithWithholdingReadOnly: Story = {
  args: { whtRate: "0.03" },
};

export const EditableRate: Story = {
  render: () => {
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
    return <Harness />;
  },
};
