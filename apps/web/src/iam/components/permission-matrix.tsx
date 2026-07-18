import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PERMISSIONS, type Permission } from "@erp/contracts";
import { Checkbox, Switch, cn } from "@erp/ui";

/** `hr.salary.*` / `inventory.cost.*` render as captioned toggles below the grid (MD2), never as
 * ordinary grid cells — over-granting them is exactly the mistake the separation prevents. */
const SPECIAL_GROUP_PREFIXES = ["hr.salary.", "inventory.cost."] as const;

function isSpecialPermission(code: string): boolean {
  return SPECIAL_GROUP_PREFIXES.some((prefix) => code.startsWith(prefix));
}

interface ParsedCode {
  module: string;
  resource: string;
  action: string;
}

/** Codes are `module.resource.action`, except the M4 `production.scan` exception (two segments) —
 * there the module doubles as the row and the second segment is the action. */
function parseCode(code: string): ParsedCode {
  const parts = code.split(".");
  if (parts.length >= 3) {
    return { module: parts[0]!, resource: parts[1]!, action: parts.slice(2).join(".") };
  }
  return { module: parts[0]!, resource: parts[0]!, action: parts[1] ?? parts[0]! };
}

interface ModuleGroup {
  module: string;
  /** The action columns actually used by this module's resources, alphabetical. */
  actions: string[];
  resources: { resource: string; cells: Partial<Record<string, Permission>> }[];
}

function buildGroups(codes: readonly Permission[]): ModuleGroup[] {
  const byModule = new Map<string, Map<string, Map<string, Permission>>>();
  for (const code of codes) {
    const { module, resource, action } = parseCode(code);
    const resources = byModule.get(module) ?? new Map<string, Map<string, Permission>>();
    byModule.set(module, resources);
    const cells = resources.get(resource) ?? new Map<string, Permission>();
    resources.set(resource, cells);
    cells.set(action, code);
  }

  return [...byModule.entries()]
    .map(([module, resources]) => {
      const actionSet = new Set<string>();
      for (const cells of resources.values()) {
        for (const action of cells.keys()) actionSet.add(action);
      }
      return {
        module,
        actions: [...actionSet].sort(),
        resources: [...resources.entries()]
          .map(([resource, cells]) => ({ resource, cells: Object.fromEntries(cells) }))
          .sort((a, b) => a.resource.localeCompare(b.resource)),
      };
    })
    .sort((a, b) => a.module.localeCompare(b.module));
}

export interface PermissionMatrixLabels {
  affectsUsers: (n: number) => string;
  specialGroupCaption: string;
  lastPermissionBlocked: string;
  collapseGroup: (module: string) => string;
  expandGroup: (module: string) => string;
}

const defaultLabels: PermissionMatrixLabels = {
  affectsUsers: (n) =>
    `This will affect ${n} active user${n === 1 ? "" : "s"} — they will be force re-authenticated.`,
  specialGroupCaption: "Salary & cost visibility — grant these separately to avoid accidental over-exposure.",
  lastPermissionBlocked: "A system role must keep at least one permission.",
  collapseGroup: (module) => `Collapse ${module}`,
  expandGroup: (module) => `Expand ${module}`,
};

export interface PermissionMatrixProps {
  /** The permission catalog to render; defaults to the full `@erp/contracts` `PERMISSIONS` list. */
  catalog?: readonly Permission[];
  /** Currently granted codes. */
  value: Permission[];
  onChange: (next: Permission[]) => void;
  /** A system role can never be emptied — the last checked cell blocks inline instead of unchecking. */
  isSystemRole?: boolean;
  /** Users bound to this role — shown once the selection differs from `initialValue` (or always, if
   * `initialValue` is omitted and a count is supplied). */
  affectedUserCount?: number;
  /** The role's saved permission set — enables the live dirty-diff behind the "affects N" caption. */
  initialValue?: Permission[];
  labels?: Partial<PermissionMatrixLabels>;
  className?: string;
}

/**
 * Module×action permission grid built from the `@erp/contracts` `PERMISSIONS` catalog (MD2) — rows =
 * `module.resource`, columns = the actions actually used by that module (the catalog's action names
 * vary per module, so columns are derived, not a fixed global set). Groups collapse per module.
 * `hr.salary.*`/`inventory.cost.*` render as separate captioned toggles below the grid, never as grid
 * cells. Presentational: the parent owns persistence and the save confirmation.
 */
export function PermissionMatrix({
  catalog = PERMISSIONS,
  value,
  onChange,
  isSystemRole = false,
  affectedUserCount,
  initialValue,
  labels: labelsProp,
  className,
}: PermissionMatrixProps) {
  const labels = React.useMemo(() => ({ ...defaultLabels, ...labelsProp }), [labelsProp]);
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [blocked, setBlocked] = React.useState(false);

  const { gridCodes, specialCodes } = React.useMemo(() => {
    const grid: Permission[] = [];
    const special: Permission[] = [];
    for (const code of catalog) (isSpecialPermission(code) ? special : grid).push(code);
    return { gridCodes: grid, specialCodes: special };
  }, [catalog]);

  const groups = React.useMemo(() => buildGroups(gridCodes), [gridCodes]);
  const granted = React.useMemo(() => new Set(value), [value]);

  const isDirty = React.useMemo(() => {
    if (!initialValue) return affectedUserCount != null;
    if (initialValue.length !== value.length) return true;
    const initial = new Set(initialValue);
    return value.some((code) => !initial.has(code));
  }, [value, initialValue, affectedUserCount]);

  function setChecked(code: Permission, checked: boolean) {
    if (!checked) {
      const next = value.filter((c) => c !== code);
      if (isSystemRole && next.length === 0) {
        setBlocked(true);
        return;
      }
      setBlocked(false);
      onChange(next);
      return;
    }
    setBlocked(false);
    if (granted.has(code)) return;
    onChange([...value, code]);
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {isDirty && affectedUserCount != null && (
        <p className="rounded-md border border-warning bg-warning-subtle px-3 py-2 text-sm text-warning-on">
          {labels.affectsUsers(affectedUserCount)}
        </p>
      )}
      {blocked && (
        <p className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger-on">
          {labels.lastPermissionBlocked}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {groups.map((group) => {
          const isCollapsed = collapsed[group.module] ?? false;
          return (
            <div key={group.module} className="overflow-hidden rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setCollapsed((prev) => ({ ...prev, [group.module]: !isCollapsed }))}
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? labels.expandGroup(group.module) : labels.collapseGroup(group.module)}
                className="flex w-full items-center gap-2 bg-bg-sunken px-3 py-2 text-left text-body-strong text-text-primary hover:bg-bg-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
              >
                {isCollapsed ? <ChevronRight aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
                <span className="capitalize">{group.module}</span>
              </button>

              {!isCollapsed && (
                <table role="grid" className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                        &nbsp;
                      </th>
                      {group.actions.map((action) => (
                        <th
                          key={action}
                          scope="col"
                          className="px-3 py-2 text-center text-caption font-semibold uppercase tracking-wide text-text-muted"
                        >
                          {action}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.resources.map((row) => (
                      <tr key={row.resource} className="border-b border-border last:border-b-0">
                        <th scope="row" className="px-3 py-2 text-left font-normal text-text-primary">
                          {row.resource}
                        </th>
                        {group.actions.map((action) => {
                          const code = row.cells[action];
                          return (
                            <td key={action} className="px-3 py-2 text-center">
                              {code ? (
                                <Checkbox
                                  aria-label={code}
                                  checked={granted.has(code)}
                                  onCheckedChange={(checked) => setChecked(code, checked === true)}
                                />
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      {specialCodes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-sunken p-3">
          <p className="text-caption text-text-muted">{labels.specialGroupCaption}</p>
          {specialCodes.map((code) => (
            <label key={code} className="flex items-center justify-between gap-3 text-sm text-text-primary">
              <span>{code}</span>
              <Switch
                aria-label={code}
                checked={granted.has(code)}
                onCheckedChange={(checked) => setChecked(code, checked)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
