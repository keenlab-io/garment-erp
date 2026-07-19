import * as React from "react";
import { CreditCard, FileText, Award, File as FileIcon } from "lucide-react";
import type { EmployeeDocumentType } from "@erp/contracts";
import { Button, Icon, cn } from "@erp/ui";

const TYPE_ICON: Record<EmployeeDocumentType, typeof FileIcon> = {
  ID_CARD: CreditCard,
  CONTRACT: FileText,
  CERTIFICATE: Award,
  OTHER: FileIcon,
};

const TYPE_LABEL: Record<EmployeeDocumentType, string> = {
  ID_CARD: "ID card",
  CONTRACT: "Contract",
  CERTIFICATE: "Certificate",
  OTHER: "Other",
};

export interface DocumentVaultRowDocument {
  id: string;
  type: EmployeeDocumentType;
  fileName: string;
  /** ISO datetime the document was uploaded. */
  uploadedAt: string;
}

export interface DocumentVaultRowLabels {
  download: string;
  uploaded: (formatted: string) => string;
}

const defaultLabels: DocumentVaultRowLabels = {
  download: "Download",
  uploaded: (formatted) => `Uploaded ${formatted}`,
};

export interface DocumentVaultRowProps {
  document: DocumentVaultRowDocument;
  /** Requests a fresh signed URL and starts the download — never rendered inline. */
  onDownload: () => void | Promise<void>;
  downloading?: boolean;
  formatDateTime?: (iso: string) => string;
  labels?: Partial<DocumentVaultRowLabels>;
  className?: string;
}

const defaultFormatDateTime = (iso: string) => new Date(iso).toLocaleString();

/**
 * A secure employee-document row (M2 §3.4, design MD4) — files download via a fresh signed URL
 * requested on demand; documents (notably ID cards) are never rendered inline.
 */
export function DocumentVaultRow({
  document,
  onDownload,
  downloading = false,
  formatDateTime = defaultFormatDateTime,
  labels: labelsProp,
  className,
}: DocumentVaultRowProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const TypeIcon = TYPE_ICON[document.type];

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border border-border bg-bg-surface px-3 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Icon icon={TypeIcon} label={TYPE_LABEL[document.type]} className="shrink-0 text-text-secondary" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-text-primary">{document.fileName}</span>
          <span className="text-caption text-text-muted">{labels.uploaded(formatDateTime(document.uploadedAt))}</span>
        </div>
      </div>
      <Button variant="secondary" onClick={() => onDownload()} loading={downloading}>
        {labels.download}
      </Button>
    </div>
  );
}
