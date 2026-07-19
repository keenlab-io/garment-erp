import * as React from "react";
import { useTranslation } from "react-i18next";
import { PaperPreview, type PaperPreviewLine } from "../../../sales/components/paper-preview.js";
import {
  TemplateDesigner,
  emptyNamedRangeMapping,
  type NamedRangeMapping,
  type TemplateAssetSlot,
} from "../../../sales/components/template-designer.js";

const SAMPLE_LINES: PaperPreviewLine[] = [
  { id: "1", description: "Sample line item", qty: "2.0000", unitPrice: "500.0000", lineTotal: "1000.00" },
  { id: "2", description: "Another line item", qty: "1.0000", unitPrice: "250.0000", lineTotal: "250.00" },
];

/**
 * The document template designer (M5 §4.6, design MD6) — asset slots + named-range map, hosted
 * over a sample document so "changes reflect in the preview" (spec) is visible immediately. The
 * `sales` contract has no `document_template` endpoints (design D10 defers that wiring), so this
 * screen is a pure client-side workbench; persistence lands once the contract grows one.
 */
export function DocumentTemplatesPage() {
  const { t } = useTranslation("sales");

  const [assets, setAssets] = React.useState<Record<TemplateAssetSlot, string | null>>({
    logo: null,
    signature: null,
    stamp: null,
  });
  const [mappings, setMappings] = React.useState<NamedRangeMapping[]>([emptyNamedRangeMapping()]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("templates.title")}</h1>
      <p className="text-sm text-text-secondary">{t("templates.description")}</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TemplateDesigner
          assets={assets}
          onAssetChange={(slot, url) => setAssets((prev) => ({ ...prev, [slot]: url }))}
          mappings={mappings}
          onMappingsChange={setMappings}
          className="rounded-lg border border-border bg-bg-surface p-5 shadow-sm"
          labels={{
            assetsTitle: t("templates.assetsTitle"),
            slot: { logo: t("templates.slotLogo"), signature: t("templates.slotSignature"), stamp: t("templates.slotStamp") },
            uploadLabel: t("templates.uploadLabel"),
            removeAsset: t("templates.removeAsset"),
            noAsset: t("templates.noAsset"),
            mappingsTitle: t("templates.mappingsTitle"),
            rangeNameLabel: t("templates.rangeNameLabel"),
            fieldLabel: t("templates.fieldLabel"),
            addMapping: t("templates.addMapping"),
            removeMapping: t("templates.removeMapping"),
          }}
        />

        <div className="relative">
          {assets.logo && (
            <img src={assets.logo} alt={t("templates.slotLogo")} className="absolute right-6 top-6 h-12 w-auto object-contain" />
          )}
          <PaperPreview
            docTypeLabel={t("templates.previewDocType")}
            docNo="QV20260001"
            date={t("templates.previewDate")}
            customer={{ name: t("templates.previewCustomer") }}
            lines={SAMPLE_LINES}
            totals={{ subtotal: "1250.00", vatAmount: "87.50", grandTotal: "1337.50" }}
            footer={
              (assets.signature || assets.stamp) && (
                <div className="flex justify-end gap-4">
                  {assets.signature && <img src={assets.signature} alt={t("templates.slotSignature")} className="h-16 w-auto object-contain" />}
                  {assets.stamp && <img src={assets.stamp} alt={t("templates.slotStamp")} className="h-16 w-auto object-contain" />}
                </div>
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
