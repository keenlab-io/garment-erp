import * as React from "react";
import { Button, Input, cn } from "@erp/ui";

export type TemplateAssetSlot = "logo" | "signature" | "stamp";

export const TEMPLATE_ASSET_SLOTS: TemplateAssetSlot[] = ["logo", "signature", "stamp"];

export interface NamedRangeMapping {
  id: string;
  /** The Excel named range, e.g. "grand_total". */
  rangeName: string;
  /** The document field it maps to, e.g. "grandTotal". */
  field: string;
}

export function emptyNamedRangeMapping(): NamedRangeMapping {
  return { id: crypto.randomUUID(), rangeName: "", field: "" };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export interface TemplateDesignerLabels {
  assetsTitle: string;
  slot: Record<TemplateAssetSlot, string>;
  uploadLabel: string;
  removeAsset: string;
  noAsset: string;
  mappingsTitle: string;
  rangeNameLabel: string;
  fieldLabel: string;
  addMapping: string;
  removeMapping: string;
}

const defaultLabels: TemplateDesignerLabels = {
  assetsTitle: "Assets",
  slot: { logo: "Logo", signature: "Signature", stamp: "Stamp" },
  uploadLabel: "Upload",
  removeAsset: "Remove",
  noAsset: "Not set",
  mappingsTitle: "Excel named-range map",
  rangeNameLabel: "Named range",
  fieldLabel: "Document field",
  addMapping: "+ Add mapping",
  removeMapping: "Remove",
};

export interface TemplateDesignerProps {
  /** A data-URL (or hosted URL) per asset slot; `null` = not configured. */
  assets: Record<TemplateAssetSlot, string | null>;
  onAssetChange: (slot: TemplateAssetSlot, url: string | null) => void;
  mappings: NamedRangeMapping[];
  onMappingsChange: (mappings: NamedRangeMapping[]) => void;
  labels?: Partial<Omit<TemplateDesignerLabels, "slot">> & { slot?: Partial<TemplateDesignerLabels["slot"]> };
  className?: string;
}

/**
 * The document template designer (M5 §3.4, design MD6) — logo/signature/stamp asset slots and an
 * Excel named-range map. The `sales` contract has no `document_template` endpoints yet (design D10
 * defers that wiring), so this is a pure controlled component: the parent owns persistence once
 * that lands, and feeds `assets`/`mappings` straight into `PaperPreview` so changes are reflected
 * live (spec "Configure template assets" scenario).
 */
export function TemplateDesigner({
  assets,
  onAssetChange,
  mappings,
  onMappingsChange,
  labels: labelsProp,
  className,
}: TemplateDesignerProps) {
  const labels = { ...defaultLabels, ...labelsProp, slot: { ...defaultLabels.slot, ...labelsProp?.slot } };

  function updateMapping(id: string, patch: Partial<NamedRangeMapping>) {
    onMappingsChange(mappings.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function handleUpload(slot: TemplateAssetSlot, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    onAssetChange(slot, await readFileAsDataUrl(file));
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-primary">{labels.assetsTitle}</h3>
        <div className="flex flex-wrap gap-4">
          {TEMPLATE_ASSET_SLOTS.map((slot) => (
            <div key={slot} className="flex w-40 flex-col items-center gap-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium text-text-primary">{labels.slot[slot]}</p>
              {assets[slot] ? (
                <img src={assets[slot]!} alt={labels.slot[slot]} className="h-16 w-full object-contain" />
              ) : (
                <p className="text-caption text-text-muted">{labels.noAsset}</p>
              )}
              <label className="w-full">
                <span className="sr-only">{`${labels.uploadLabel} ${labels.slot[slot]}`}</span>
                <input
                  type="file"
                  accept="image/*"
                  aria-label={`${labels.uploadLabel} ${labels.slot[slot]}`}
                  onChange={(e) => void handleUpload(slot, e.target.files)}
                  className="w-full text-caption"
                />
              </label>
              {assets[slot] && (
                <Button type="button" variant="ghost" onClick={() => onAssetChange(slot, null)}>
                  {labels.removeAsset}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-primary">{labels.mappingsTitle}</h3>
        {mappings.map((mapping) => (
          <div key={mapping.id} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-primary">{labels.rangeNameLabel}</span>
              <Input
                value={mapping.rangeName}
                onChange={(e) => updateMapping(mapping.id, { rangeName: e.target.value })}
                className="w-48"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-primary">{labels.fieldLabel}</span>
              <Input
                value={mapping.field}
                onChange={(e) => updateMapping(mapping.id, { field: e.target.value })}
                className="w-48"
              />
            </label>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onMappingsChange(mappings.filter((m) => m.id !== mapping.id))}
            >
              {labels.removeMapping}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => onMappingsChange([...mappings, emptyNamedRangeMapping()])}
          className="self-start"
        >
          {labels.addMapping}
        </Button>
      </div>
    </div>
  );
}
