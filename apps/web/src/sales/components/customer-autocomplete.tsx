import * as React from "react";
import type { Customer } from "@erp/contracts";
import { Combobox, FormField, cn } from "@erp/ui";

function formatAddress(customer: Customer): string | null {
  const address = customer.addresses.find((a) => a.is_default) ?? customer.addresses[0];
  if (!address) return null;
  return [address.line1, address.subdistrict, address.district, address.province, address.postal_code]
    .filter(Boolean)
    .join(", ");
}

export interface CustomerAutocompleteLabels {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  taxIdLabel: string;
  branchLabel: string;
  addressLabel: string;
  noTaxFields: string;
}

const defaultLabels: CustomerAutocompleteLabels = {
  label: "Customer",
  placeholder: "Look up a customer…",
  searchPlaceholder: "Search by name or tax id…",
  emptyMessage: "No customers found",
  taxIdLabel: "Tax id",
  branchLabel: "Branch",
  addressLabel: "Address",
  noTaxFields: "No tax id/address on file for this customer",
};

export interface CustomerAutocompleteProps {
  customers: Customer[];
  /** Selected customer id, `""` for none. */
  value: string;
  onSelect: (customer: Customer | null) => void;
  loading?: boolean;
  /** Drives async server-side search by name/tax_id (`sales.listCustomers`'s `search` query). */
  onSearchChange?: (query: string) => void;
  labels?: Partial<CustomerAutocompleteLabels>;
  className?: string;
}

/**
 * The customer autocomplete (M5 §3.4, design MD3) — searches by name/tax_id and, once a customer is
 * picked, **fills** their tax-id/branch/address read-only underneath (system-filled, never
 * free-typed where the system can fill it — error prevention). Screens (M5 §4) feed the document
 * editor's `customer_id` and default bill-to fields straight from `onSelect`.
 */
export function CustomerAutocomplete({
  customers,
  value,
  onSelect,
  loading = false,
  onSearchChange,
  labels: labelsProp,
  className,
}: CustomerAutocompleteProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const selected = React.useMemo(() => customers.find((c) => c.id === value) ?? null, [customers, value]);
  const options = React.useMemo(
    () => customers.map((c) => ({ value: c.id, label: c.tax_id ? `${c.name} · ${c.tax_id}` : c.name })),
    [customers],
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <FormField label={labels.label}>
        <Combobox
          value={value}
          onValueChange={(id) => onSelect(customers.find((c) => c.id === id) ?? null)}
          onSearchChange={onSearchChange}
          loading={loading}
          options={options}
          placeholder={labels.placeholder}
          searchPlaceholder={labels.searchPlaceholder}
          emptyMessage={labels.emptyMessage}
          aria-label={labels.label}
        />
      </FormField>
      {selected && (
        <div className="rounded-md border border-border bg-bg-sunken p-3 text-sm text-text-secondary">
          {selected.tax_id || selected.branch_code || formatAddress(selected) ? (
            <dl className="flex flex-col gap-1">
              {selected.tax_id && (
                <div className="flex gap-2">
                  <dt className="text-text-muted">{labels.taxIdLabel}</dt>
                  <dd className="font-mono text-mono text-text-primary">{selected.tax_id}</dd>
                </div>
              )}
              {selected.branch_code && (
                <div className="flex gap-2">
                  <dt className="text-text-muted">{labels.branchLabel}</dt>
                  <dd className="text-text-primary">{selected.branch_code}</dd>
                </div>
              )}
              {formatAddress(selected) && (
                <div className="flex gap-2">
                  <dt className="text-text-muted">{labels.addressLabel}</dt>
                  <dd className="text-text-primary">{formatAddress(selected)}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-text-muted">{labels.noTaxFields}</p>
          )}
        </div>
      )}
    </div>
  );
}
