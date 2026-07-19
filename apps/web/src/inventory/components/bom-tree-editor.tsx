import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toDecimal } from "@erp/utils";
import { Button, Icon, MaskedValue, MoneyCell, QtyCell, Skeleton, cn } from "@erp/ui";

export interface BomTreeNode {
  id: string;
  itemLabel: string;
  /** Quantity of this component per one unit of its parent. */
  qty: string;
  /** Scrap fraction, e.g. `"0.05"` for 5%. */
  scrapPct: string;
  unitCost: string;
  extendedCost: string;
  children?: BomTreeNode[];
  /** This component has its own active BOM but `children` hasn't been resolved yet. */
  hasChildren?: boolean;
}

export interface BomTreeEditorLabels {
  itemColumn: string;
  qtyColumn: string;
  scrapColumn: string;
  unitCostColumn: string;
  extendedCostColumn: string;
  rolledUpCostLabel: string;
  conversionCostLabel: string;
  expand: string;
  collapse: string;
}

const defaultLabels: BomTreeEditorLabels = {
  itemColumn: "Component",
  qtyColumn: "Qty",
  scrapColumn: "Scrap %",
  unitCostColumn: "Unit cost",
  extendedCostColumn: "Extended cost",
  rolledUpCostLabel: "Rolled-up cost",
  conversionCostLabel: "Conversion cost",
  expand: "Expand",
  collapse: "Collapse",
};

const INDENT_REM = 1.25;

function BomTreeRow({
  node,
  depth,
  expandedIds,
  onToggleExpand,
  onExpand,
  loadingIds,
  labels,
  alwaysOpen = false,
}: {
  node: BomTreeNode;
  depth: number;
  expandedIds: string[];
  onToggleExpand: (id: string) => void;
  onExpand?: (node: BomTreeNode) => void | Promise<void>;
  loadingIds: string[];
  labels: BomTreeEditorLabels;
  /** The root row — its components always show; there's nothing to toggle. */
  alwaysOpen?: boolean;
}) {
  const expanded = alwaysOpen || expandedIds.includes(node.id);
  const isLoading = loadingIds.includes(node.id);
  const expandable = !alwaysOpen && (Boolean(node.hasChildren) || (node.children?.length ?? 0) > 0);

  const handleToggle = () => {
    onToggleExpand(node.id);
    if (!expanded && node.hasChildren && !node.children && onExpand) {
      void onExpand(node);
    }
  };

  return (
    <>
      <tr className="border-b border-border last:border-b-0">
        <td className="py-2 pr-3" style={{ paddingLeft: `${0.75 + depth * INDENT_REM}rem` }}>
          <div className="flex items-center gap-1.5">
            {expandable ? (
              <Button
                variant="icon"
                aria-label={expanded ? labels.collapse : labels.expand}
                onClick={handleToggle}
                className="border-transparent bg-transparent"
              >
                <Icon icon={expanded ? ChevronDown : ChevronRight} size={14} />
              </Button>
            ) : (
              <span aria-hidden className="inline-block size-6" />
            )}
            <span className="text-text-primary">{node.itemLabel}</span>
          </div>
        </td>
        <td className="px-3 py-2 text-right">
          <QtyCell value={node.qty} />
        </td>
        <td className="px-3 py-2 text-right text-text-secondary">
          {`${toDecimal(node.scrapPct).times(100).toFixed(1)}%`}
        </td>
        <td className="px-3 py-2 text-right">
          <MaskedValue permission="inventory.cost.view" value={<MoneyCell value={node.unitCost} />} />
        </td>
        <td className="px-3 py-2 text-right">
          <MaskedValue permission="inventory.cost.view" value={<MoneyCell value={node.extendedCost} />} />
        </td>
      </tr>
      {expanded && isLoading && (
        <tr>
          <td colSpan={5} style={{ paddingLeft: `${0.75 + (depth + 1) * INDENT_REM}rem` }}>
            <Skeleton variant="table-row" columns={4} />
          </td>
        </tr>
      )}
      {expanded &&
        node.children?.map((child) => (
          <BomTreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
            onExpand={onExpand}
            loadingIds={loadingIds}
            labels={labels}
          />
        ))}
    </>
  );
}

export interface BomTreeEditorProps {
  root: BomTreeNode;
  conversionCost?: string | null;
  rolledUpCost?: string | null;
  /** Controlled expand/collapse state, keyed by node id. */
  expandedIds: string[];
  onToggleExpand: (id: string) => void;
  /** Lazily resolve a node's own BOM roll-up — called the first time a `hasChildren` node with no
   * `children` yet is expanded. The contract only exposes a single-level roll-up per BOM
   * (`rollupBom`), so a multi-level tree is built one roll-up call per expanding node. */
  onExpand?: (node: BomTreeNode) => void | Promise<void>;
  loadingIds?: string[];
  labels?: Partial<BomTreeEditorLabels>;
  className?: string;
}

/**
 * The BOM tree editor (M3 §3.5, design MD1) — an expand/collapse component tree with a roll-up cost
 * preview per row (unit cost × qty × (1 + scrap)). The root's direct components always show (there's
 * nothing to toggle at the top); only a sub-assembly's own components collapse by default.
 * Presentational: the caller owns expand state and lazily resolves a node's children via `onExpand`
 * when the contract's flat, single-level `Bom` doesn't already include them. Cost columns are masked
 * without `inventory.cost.view`.
 */
export function BomTreeEditor({
  root,
  conversionCost,
  rolledUpCost,
  expandedIds,
  onToggleExpand,
  onExpand,
  loadingIds = [],
  labels: labelsProp,
  className,
}: BomTreeEditorProps) {
  const labels = { ...defaultLabels, ...labelsProp };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {(conversionCost != null || rolledUpCost != null) && (
        <div className="flex flex-wrap gap-6 rounded-md border border-border bg-bg-sunken px-3 py-2 text-sm">
          {conversionCost != null && (
            <span className="flex items-center gap-1.5 text-text-secondary">
              {labels.conversionCostLabel}
              <MaskedValue permission="inventory.cost.view" value={<MoneyCell value={conversionCost} />} />
            </span>
          )}
          {rolledUpCost != null && (
            <span className="flex items-center gap-1.5 font-medium text-text-primary">
              {labels.rolledUpCostLabel}
              <MaskedValue permission="inventory.cost.view" value={<MoneyCell value={rolledUpCost} />} />
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-bg-sunken">
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.itemColumn}
              </th>
              <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.qtyColumn}
              </th>
              <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.scrapColumn}
              </th>
              <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.unitCostColumn}
              </th>
              <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.extendedCostColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            <BomTreeRow
              node={root}
              depth={0}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onExpand={onExpand}
              loadingIds={loadingIds}
              labels={labels}
              alwaysOpen
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}
