import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import {
  ImportValidationTable,
  type ImportRowResult,
  type ImportValidationTableLabels,
} from "./import-validation-table";

/** Wires the component's `labels` prop to the real `iam` namespace so the Storybook toolbar's
 * locale control actually retranslates the review table — the same wiring permission-import.tsx
 * uses in the app (M1 §5.1). */
function useImportLabels(): ImportValidationTableLabels {
  const { t } = useTranslation("iam");
  return {
    dropzoneLabel: t("import.dropzoneLabel"),
    dropzoneHint: t("import.dropzoneHint"),
    browseButton: t("import.browseButton"),
    rowColumn: t("import.rowColumn"),
    statusColumn: t("import.statusColumn"),
    reasonColumn: t("import.reasonColumn"),
    okStatus: t("import.okStatus"),
    errorStatus: t("import.errorStatus"),
    importValid: (count) => t("import.importValid", { count }),
    reupload: t("import.reupload"),
    noRows: t("import.noRows"),
  };
}

const MIXED_ROWS: ImportRowResult[] = [
  { row: 2, status: "ok" },
  { row: 3, status: "error", reason: "Unknown permission code: iam.user.delete" },
  { row: 4, status: "ok" },
  { row: 5, status: "error", reason: "Missing role name" },
];

const meta = {
  title: "IAM/ImportValidationTable",
  component: ImportValidationTable,
  args: { rows: [], onFilesSelected: () => {}, onImport: () => {} },
  parameters: { layout: "padded" },
} satisfies Meta<typeof ImportValidationTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Before any upload — the dropzone with no review table yet. */
export const Empty: Story = {
  render: function Demo() {
    const labels = useImportLabels();
    return <ImportValidationTable rows={[]} onFilesSelected={() => {}} onImport={() => {}} labels={labels} />;
  },
};

/** A mixed valid/invalid review (MD5): the primary action only imports the valid rows. */
export const ValidAndInvalidRows: Story = {
  render: function Demo() {
    const labels = useImportLabels();
    return (
      <ImportValidationTable rows={MIXED_ROWS} onFilesSelected={() => {}} onImport={() => {}} labels={labels} />
    );
  },
};

/** Every row failed — the primary action is disabled, "fix & re-upload" is the only path forward. */
export const AllInvalid: Story = {
  render: function Demo() {
    const labels = useImportLabels();
    return (
      <ImportValidationTable
        rows={[{ row: 2, status: "error", reason: "Unknown permission code: bogus.code" }]}
        onFilesSelected={() => {}}
        onImport={() => {}}
        labels={labels}
      />
    );
  },
};
