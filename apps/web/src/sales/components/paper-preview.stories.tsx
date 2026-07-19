import type { Meta, StoryObj } from "@storybook/react-vite";
import { PaperPreview, type PaperPreviewLine } from "./paper-preview";

const LINES: PaperPreviewLine[] = [
  { id: "l1", description: "Cotton jersey, 200 units", qty: "200.000000", unitPrice: "250.0000", lineTotal: "50000.0000" },
];

const meta = {
  title: "Sales/PaperPreview",
  component: PaperPreview,
  args: {
    docTypeLabel: "ใบเสนอราคา / Quotation",
    docNo: "QV20260042",
    date: "19 Jul 2026 (BE 2569)",
    customer: { name: "Siam Garments Co.", taxId: "0105561000001", branchCode: "HQ" },
    lines: LINES,
    totals: { subtotal: "50000.0000", vatAmount: "3500.0000", grandTotal: "53500.0000" },
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof PaperPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Quotation: Story = {};

export const InvoiceWithWithholding: Story = {
  args: {
    docTypeLabel: "ใบแจ้งหนี้ / Invoice",
    docNo: "IV20260099",
    totals: {
      subtotal: "50000.0000",
      vatAmount: "3500.0000",
      grandTotal: "53500.0000",
      whtAmount: "1500.0000",
    },
  },
};

export const WithPromptPayFooter: Story = {
  args: {
    footer: <p className="text-caption text-text-muted">[PromptPay QR block renders here]</p>,
  },
};
