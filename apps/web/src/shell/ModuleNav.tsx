import { MODULE_CHILDREN } from "../nav/registry";
import type { ModuleDescriptor } from "../nav/types";
import { NavItem } from "./NavItem";
import { NavGroup } from "./NavGroup";

/**
 * One navigation entry: an expandable `NavGroup` when the module has sub-routes (`MODULE_CHILDREN`),
 * otherwise a flat `NavItem` link. Shared by the sidebar and the mobile drawer so the two never drift.
 */
export function ModuleNav({
  module,
  onNavigate,
}: {
  module: ModuleDescriptor;
  onNavigate?: () => void;
}) {
  const items = MODULE_CHILDREN[module.key];
  return items ? (
    <NavGroup module={module} items={items} onNavigate={onNavigate} />
  ) : (
    <NavItem module={module} onNavigate={onNavigate} />
  );
}
