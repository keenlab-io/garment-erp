import * as React from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import {
  Button,
  DataTable,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  FormField,
  Input,
  MoneyCell,
  PermissionButton,
  Skeleton,
  textColumn,
  useToast,
} from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import { SALES_CUSTOMERS_PATH } from "../../../nav/sales-paths.js";
import { AGING_BUCKET_LABEL_KEY } from "../../../sales/aging-labels.js";
import { DocLifecycleChip } from "../../../sales/components/doc-lifecycle-chip.js";
import { useSalesDocuments } from "../../../sales/document-store.js";
import { DOC_LIFECYCLE_LABEL_KEY } from "../../../sales/doc-lifecycle-labels.js";
import { useAgingReportQuery, useCreateCustomerMutation, useCustomersQuery } from "../../../sales/queries.js";

interface CustomerRow {
  id: string;
  name: string;
  taxId: string;
  branchCode: string;
  creditTermsDays: number;
}

function CreateCustomerDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("sales");
  const { toast } = useToast();
  const createCustomer = useCreateCustomerMutation();

  const [name, setName] = React.useState("");
  const [taxId, setTaxId] = React.useState("");
  const [branchCode, setBranchCode] = React.useState("");
  const [creditTermsDays, setCreditTermsDays] = React.useState("0");
  const [addressLine1, setAddressLine1] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName("");
      setTaxId("");
      setBranchCode("");
      setCreditTermsDays("0");
      setAddressLine1("");
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    await createCustomer.mutateAsync({
      body: {
        name,
        tax_id: taxId || undefined,
        branch_code: branchCode || undefined,
        credit_terms_days: Number(creditTermsDays) || 0,
        addresses: addressLine1 ? [{ line1: addressLine1, is_default: true }] : [],
      },
    });
    toast({ tone: "success", title: t("customers.created") });
    onOpenChange(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        <DrawerHeader>
          <DrawerTitle className="text-h3 font-semibold text-text-primary">{t("customers.newCustomer")}</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DrawerBody className="flex flex-col gap-3">
            <FormField label={t("customers.fieldName")} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </FormField>
            <FormField label={t("customers.fieldTaxId")} help={t("customers.taxIdHint")}>
              <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} />
            </FormField>
            <FormField label={t("customers.fieldBranchCode")}>
              <Input value={branchCode} onChange={(e) => setBranchCode(e.target.value)} />
            </FormField>
            <FormField label={t("customers.fieldCreditTerms")}>
              <Input type="number" min="0" value={creditTermsDays} onChange={(e) => setCreditTermsDays(e.target.value)} className="w-32" />
            </FormField>
            <FormField label={t("customers.fieldAddress")}>
              <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
            </FormField>
          </DrawerBody>
          <DrawerFooter>
            <Button type="submit" loading={createCustomer.isPending}>
              {t("customers.createAction")}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

/** The customer list + quick-create (M5 §4.4, design MD3). */
export function CustomersListPage() {
  const { t } = useTranslation("sales");
  const navigate = useNavigate();
  const { density } = useDensity();
  const [search, setSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [cursorStack, setCursorStack] = React.useState<(string | undefined)[]>([undefined]);
  const cursor = cursorStack[cursorStack.length - 1];

  const customersQuery = useCustomersQuery({ search: search || undefined, cursor, limit: 20 });
  const rows: CustomerRow[] = (customersQuery.data?.body.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    taxId: c.tax_id ?? "—",
    branchCode: c.branch_code ?? "—",
    creditTermsDays: c.credit_terms_days,
  }));
  const nextCursor = customersQuery.data?.body.next_cursor ?? null;

  const columns = React.useMemo<ColumnDef<CustomerRow>[]>(
    () => [
      textColumn<CustomerRow>("name", { header: t("customers.columnName") }),
      textColumn<CustomerRow>("taxId", { header: t("customers.columnTaxId"), mono: true }),
      textColumn<CustomerRow>("branchCode", { header: t("customers.columnBranch"), secondary: true }),
      {
        id: "creditTermsDays",
        header: t("customers.columnCreditTerms"),
        meta: { secondary: true, align: "right" },
        cell: ({ row }) => t("customers.creditTermsValue", { count: row.original.creditTermsDays }),
      },
    ],
    [t],
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("customers.title")}</h1>
        <PermissionButton required="sales.customer.manage" onClick={() => setCreateOpen(true)}>
          {t("customers.newCustomer")}
        </PermissionButton>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        tableId="sales-customers"
        density={density}
        isLoading={customersQuery.isLoading}
        error={customersQuery.isError ? { message: t("customers.loadError") } : null}
        onRetry={() => customersQuery.refetch()}
        emptyState={{ title: t("customers.empty") }}
        nextCursor={nextCursor}
        onNextPage={() => {
          if (nextCursor) setCursorStack((stack) => [...stack, nextCursor]);
        }}
        onPrevPage={cursorStack.length > 1 ? () => setCursorStack((stack) => stack.slice(0, -1)) : undefined}
        toolbar={
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCursorStack([undefined]);
            }}
            placeholder={t("customers.searchPlaceholder")}
            aria-label={t("customers.searchPlaceholder")}
            className="max-w-64"
          />
        }
        rowActions={(row) => [
          {
            key: "view",
            label: t("customers.viewAction"),
            onClick: () => void navigate({ to: "/sales/customers/$id", params: { id: row.id } }),
          },
        ]}
      />

      <CreateCustomerDrawer open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

/**
 * The customer detail screen (M5 §4.4) — profile + aging (from `agingReport`, which is keyed by
 * customer) + this session's documents for the customer (the `sales` contract has no
 * per-customer document list, same gap `document-store.ts` documents). The contract also has no
 * `getCustomer`-by-id, so the profile is looked up out of a broad `listCustomers` page — a future
 * contract read replaces this scan.
 */
export function CustomerDetailPage() {
  const { id } = useParams({ from: "/sales/customers/$id" });
  const { t } = useTranslation("sales");

  const customersQuery = useCustomersQuery({ limit: 100 });
  const customer = customersQuery.data?.body.data.find((c) => c.id === id);
  const agingQuery = useAgingReportQuery();
  const agingRow = agingQuery.data?.body.rows.find((r) => r.customer_id === id);
  const documents = useSalesDocuments().filter((record) =>
    record.kind === "quotation" ? record.quotation.customer_id === id : record.invoice.customer_id === id,
  );

  if (customersQuery.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <Link to={SALES_CUSTOMERS_PATH} className="text-sm text-text-link">
          ← {t("customers.back")}
        </Link>
        <p className="text-sm text-danger">{t("customers.notFound")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link to={SALES_CUSTOMERS_PATH} className="text-sm text-text-link">
          ← {t("customers.back")}
        </Link>
        <h1 className="font-display text-h1 font-semibold text-text-primary">{customer.name}</h1>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-caption text-text-muted">{t("customers.columnTaxId")}</dt>
            <dd className="font-mono text-mono text-text-primary">{customer.tax_id ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-muted">{t("customers.columnBranch")}</dt>
            <dd className="text-text-primary">{customer.branch_code ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-muted">{t("customers.columnCreditTerms")}</dt>
            <dd className="text-text-primary">{t("customers.creditTermsValue", { count: customer.credit_terms_days })}</dd>
          </div>
        </dl>
        {customer.addresses.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-text-secondary">
            {customer.addresses.map((address, i) => (
              <li key={i}>
                {[address.line1, address.subdistrict, address.district, address.province, address.postal_code].filter(Boolean).join(", ")}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
        <h2 className="text-body-strong text-text-primary">{t("customers.agingHeading")}</h2>
        {agingRow ? (
          <dl className="grid grid-cols-5 gap-2 text-sm">
            {(["current", "d1_30", "d31_60", "d61_90", "over_90"] as const).map((bucket) => (
              <div key={bucket} className="flex flex-col gap-1">
                <dt className="text-caption text-text-muted">{t(AGING_BUCKET_LABEL_KEY[bucket])}</dt>
                <dd>
                  <MoneyCell value={agingRow[bucket]} />
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-text-muted">{t("customers.agingEmpty")}</p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
        <h2 className="text-body-strong text-text-primary">{t("customers.documentsHeading")}</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-text-muted">{t("customers.documentsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {documents.map((record) => {
              const doc = record.kind === "quotation" ? record.quotation : record.invoice;
              return (
                <li key={doc.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="font-mono text-mono text-text-link">{doc.doc_no}</span>
                  <DocLifecycleChip status={doc.status} label={t(DOC_LIFECYCLE_LABEL_KEY[doc.status])} />
                  <MoneyCell value={doc.grand_total} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
