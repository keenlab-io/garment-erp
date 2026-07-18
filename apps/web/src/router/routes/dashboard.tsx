import * as React from "react";
import { useTranslation } from "react-i18next";
import { Badge, DataTable, Skeleton, textColumn } from "@erp/ui";
import type { Customer } from "@erp/contracts";
import { api } from "../../api/client";
import { useDensity } from "../../density/density-context";
import { useNumberFormat } from "../../i18n/use-formatters";

/** A flattened, display-ready projection of `Customer` for the demo table's text columns. */
interface CustomerRow {
  id: string;
  name: string;
  taxId: string;
  branchCode: string;
  creditTerms: string;
}

/**
 * Landing page. M0 shows a token-styled API-health panel and a customer list on the Data Table
 * organism, both fed by the real `@ts-rest/react-query` client (contract untouched). The M5 Sales
 * contract has no invoice-listing endpoint (only single-document sub-routes), so the closest real
 * paginated list — `sales.listCustomers` — stands in for the original antd demo's invoice table.
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const { density } = useDensity();
  const uptimeFormat = useNumberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const creditTermsFormat = useNumberFormat();

  const health = api.health.check.useQuery(["health"]);

  const [cursorStack, setCursorStack] = React.useState<Array<string | undefined>>([undefined]);
  const cursor = cursorStack[cursorStack.length - 1];
  const customers = api.sales.listCustomers.useQuery(
    ["customers", cursor],
    { query: cursor ? { cursor } : {} },
  );

  const rows = React.useMemo<CustomerRow[]>(
    () =>
      (customers.data?.body.data ?? []).map((customer: Customer) => ({
        id: customer.id,
        name: customer.name,
        taxId: customer.tax_id ?? "—",
        branchCode: customer.branch_code ?? "—",
        creditTerms: creditTermsFormat.format(customer.credit_terms_days),
      })),
    [customers.data, creditTermsFormat],
  );

  const columns = React.useMemo(
    () => [
      textColumn<CustomerRow>("name", { header: t("dashboard.columnName"), sortable: true }),
      textColumn<CustomerRow>("taxId", { header: t("dashboard.columnTaxId"), secondary: true }),
      textColumn<CustomerRow>("branchCode", {
        header: t("dashboard.columnBranchCode"),
        secondary: true,
      }),
      textColumn<CustomerRow>("creditTerms", { header: t("dashboard.columnCreditTerms") }),
    ],
    [t],
  );

  const nextCursor = customers.data?.body.next_cursor ?? null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">
        {t("dashboard.title")}
      </h1>

      <section className="rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-body-strong text-text-primary">{t("dashboard.apiHealth")}</h2>
        {health.isLoading ? (
          <Skeleton className="w-48" />
        ) : health.isError ? (
          <Badge tone="danger">{t("dashboard.unreachable")}</Badge>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="success">{t("dashboard.healthy")}</Badge>
            <span className="text-sm text-text-secondary">
              {t("dashboard.uptime", {
                seconds: health.data ? uptimeFormat.format(health.data.body.uptime) : "0.0",
              })}
            </span>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-body-strong text-text-primary">{t("dashboard.customers")}</h2>
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          density={density}
          isLoading={customers.isLoading}
          error={customers.isError ? { message: t("dashboard.customersLoadError") } : null}
          onRetry={() => customers.refetch()}
          emptyState={{ title: t("dashboard.customersEmpty") }}
          nextCursor={nextCursor}
          onNextPage={() => {
            if (nextCursor) setCursorStack((stack) => [...stack, nextCursor]);
          }}
          onPrevPage={
            cursorStack.length > 1
              ? () => setCursorStack((stack) => stack.slice(0, -1))
              : undefined
          }
        />
      </section>
    </div>
  );
}
