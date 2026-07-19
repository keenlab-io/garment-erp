import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { PaperPreview, type PaperPreviewLine, type PaperPreviewProps } from "./paper-preview";

const LINES: PaperPreviewLine[] = [
  { id: "l1", description: "Cotton jersey, 200 units", qty: "200.000000", unitPrice: "250.0000", lineTotal: "50000.0000" },
];

/** Wires the preview's `labels` to the real `sales` namespace so the Storybook toolbar's locale
 * control retranslates it (M5 §5.3, mirrors `subcontract-sla-chip.stories.tsx`'s wiring). The
 * document-type headline stays bilingual regardless of locale — the printed document itself
 * carries both names (design MD1, §5.1), unlike the surrounding app chrome. */
function Demo({
  docKind = "quotation",
  ...props
}: Partial<PaperPreviewProps> & { docKind?: "quotation" | "invoice" }) {
  const { t } = useTranslation("sales");
  return (
    <PaperPreview
      docTypeLabel={
        docKind === "quotation"
          ? t("documentEditor.docTypeQuotationBilingual")
          : t("documentEditor.docTypeInvoiceBilingual")
      }
      docNo={docKind === "quotation" ? "QV20260042" : "IV20260099"}
      date="19 Jul 2026 (BE 2569)"
      customer={{ name: "Siam Garments Co.", taxId: "0105561000001", branchCode: "HQ" }}
      lines={LINES}
      totals={{ subtotal: "50000.0000", vatAmount: "3500.0000", grandTotal: "53500.0000" }}
      {...props}
      labels={{
        billTo: t("documentEditor.billTo"),
        docNoLabel: t("documentEditor.docNoLabel"),
        dateLabel: t("documentEditor.dateLabel"),
        subtotalLabel: t("documentEditor.subtotalLabel"),
        vatLabel: t("documentEditor.vatLabel"),
        whtLabel: t("documentEditor.whtLabel"),
        netToReceiveLabel: t("documentEditor.netToReceiveLabel"),
        grandTotalLabel: t("documentEditor.grandTotalLabel"),
        ...props.labels,
      }}
    />
  );
}

const meta = {
  title: "Sales/PaperPreview",
  parameters: { layout: "padded" },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Quotation: Story = {
  render: () => <Demo />,
};

export const InvoiceWithWithholding: Story = {
  render: () => (
    <Demo
      docKind="invoice"
      totals={{
        subtotal: "50000.0000",
        vatAmount: "3500.0000",
        grandTotal: "53500.0000",
        whtAmount: "1500.0000",
      }}
    />
  ),
};

export const WithPromptPayFooter: Story = {
  render: () => (
    <Demo footer={<p className="text-caption text-text-muted">[PromptPay QR block renders here]</p>} />
  ),
};
