import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocumentVaultRow } from "./document-vault-row";

const meta = {
  title: "HR/DocumentVaultRow",
  component: DocumentVaultRow,
  args: {
    document: {
      id: "d1",
      type: "ID_CARD",
      fileName: "national-id.pdf",
      uploadedAt: "2026-06-01T09:00:00.000Z",
    },
    onDownload: () => {},
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof DocumentVaultRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IdCard: Story = {};

export const Contract: Story = {
  args: {
    document: {
      id: "d2",
      type: "CONTRACT",
      fileName: "employment-contract.pdf",
      uploadedAt: "2026-05-15T09:00:00.000Z",
    },
  },
};

export const Downloading: Story = {
  args: { downloading: true },
};
