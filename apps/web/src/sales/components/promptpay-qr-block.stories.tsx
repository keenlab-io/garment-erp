import type { Meta, StoryObj } from "@storybook/react-vite";
import { PromptPayQrBlock } from "./promptpay-qr-block";

const meta = {
  title: "Sales/PromptPayQrBlock",
  component: PromptPayQrBlock,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PromptPayQrBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLE_QR = {
  payload: "00020101021129370016A000000677010111011300668000000005802TH",
  png_base64:
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
};

export const Issued: Story = {
  args: { qr: SAMPLE_QR, amount: "53500.0000" },
};

export const Loading: Story = {
  args: { qr: null, loading: true },
};

export const NotYetIssued: Story = {
  args: { qr: null },
};
