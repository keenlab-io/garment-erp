import * as React from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { EmployeeDocumentType, EmploymentType } from "@erp/contracts";
import {
  Button,
  FormField,
  Input,
  InkChip,
  MaskedValue,
  MoneyCell,
  PermissionButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  cn,
  useToast,
} from "@erp/ui";
import type { ChipStatus } from "@erp/ui";
import { useDateFormat } from "../../../i18n/use-formatters.js";
import { HR_EMPLOYEES_PATH } from "../../../nav/hr-paths.js";
import {
  useAddSalaryRecordMutation,
  useEmployeeDocumentUrlMutation,
  useEmployeeDocumentsQuery,
  useEmployeeQuery,
  useUpdateEmployeeMutation,
  useUploadEmployeeDocumentMutation,
} from "../../../hr/queries.js";
import { DocumentVaultRow } from "../../../hr/components/document-vault-row.js";

const TABS = ["profile", "documents", "salary", "pay-components", "reporting"] as const;
type EmployeeTab = (typeof TABS)[number];

const TAB_LABEL_KEY = {
  profile: "employeeDetail.tabProfile",
  documents: "employeeDetail.tabDocuments",
  salary: "employeeDetail.tabSalary",
  "pay-components": "employeeDetail.tabPayComponents",
  reporting: "employeeDetail.tabReporting",
} as const satisfies Record<EmployeeTab, string>;

const STATUS_CHIP: Record<string, ChipStatus> = {
  PROBATION: "pending",
  ACTIVE: "approved",
  RESIGNED: "void",
  SUSPENDED: "hold",
};

/**
 * The employee detail screen (M2 §4.1, design MD4): tabbed Profile · Documents · Salary ·
 * Pay components · Reporting. Salary/national-id are `MaskedValue`-gated by `hr.salary.view`;
 * documents download via a fresh signed URL (never rendered inline). "Pay components" and
 * "Reporting" have no `@erp/contracts` read surface yet (no assign/list-components or
 * reporting-line endpoint) — they render an honest empty state rather than fabricated data.
 */
export function EmployeeDetailPage() {
  const { id } = useParams({ from: "/hr/employees/$id" });
  const { t } = useTranslation(["hr", "common"]);
  const dateFormat = useDateFormat({ dateStyle: "medium" });

  const employeeQuery = useEmployeeQuery(id);
  const [tab, setTab] = React.useState<EmployeeTab>("profile");

  const employee = employeeQuery.data?.body.employee;

  if (employeeQuery.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (employeeQuery.isError || !employee) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <p className="text-sm text-danger">{t("employeeDetail.loadError")}</p>
        <Button variant="secondary" onClick={() => employeeQuery.refetch()}>
          {t("common:actions.retry")}
        </Button>
      </div>
    );
  }

  const showProbationBanner = employee.status === "PROBATION" && employee.probation_end_date;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link to={HR_EMPLOYEES_PATH} className="text-sm text-text-link">
          ← {t("employeeDetail.back")}
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-h1 font-semibold text-text-primary">
            {employee.first_name} {employee.last_name}
          </h1>
          <InkChip status={STATUS_CHIP[employee.status] ?? "draft"} />
        </div>
        <p className="text-sm text-text-secondary">{employee.emp_code}</p>
      </div>

      {showProbationBanner && (
        <p className="rounded-md border border-warning bg-warning-subtle px-3 py-2 text-sm text-warning-on">
          {t("employeeDetail.probationEnding", { date: dateFormat.format(new Date(employee.probation_end_date!)) })}
        </p>
      )}

      <div role="tablist" aria-label={t("employeeDetail.tabsLabel")} className="flex gap-1 border-b border-border">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "px-3 py-2 text-sm font-medium",
              tab === key
                ? "border-b-2 border-accent text-text-primary"
                : "text-text-muted hover:text-text-primary",
            )}
          >
            {t(TAB_LABEL_KEY[key])}
          </button>
        ))}
      </div>

      {tab === "profile" && <ProfileTab employeeId={id} />}
      {tab === "documents" && <DocumentsTab employeeId={id} />}
      {tab === "salary" && <SalaryTab employeeId={id} />}
      {tab === "pay-components" && (
        <p className="text-sm text-text-muted">{t("employeeDetail.payComponentsEmpty")}</p>
      )}
      {tab === "reporting" && <p className="text-sm text-text-muted">{t("employeeDetail.reportingEmpty")}</p>}
    </div>
  );
}

function ProfileTab({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation("hr");
  const { toast } = useToast();
  const dateFormat = useDateFormat({ dateStyle: "medium" });
  const employeeQuery = useEmployeeQuery(employeeId);
  const updateEmployee = useUpdateEmployeeMutation();
  const employee = employeeQuery.data?.body.employee;

  const [editing, setEditing] = React.useState(false);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [employmentType, setEmploymentType] = React.useState<EmploymentType>("MONTHLY");

  React.useEffect(() => {
    if (employee && editing) {
      setFirstName(employee.first_name);
      setLastName(employee.last_name);
      setEmploymentType(employee.employment_type);
    }
  }, [employee, editing]);

  if (!employee) return null;

  function handleSave() {
    if (!employee) return;
    updateEmployee.mutate(
      {
        params: { id: employeeId },
        headers: { "if-match": String(employee.version) },
        body: { first_name: firstName, last_name: lastName, employment_type: employmentType },
      },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("employeeDetail.profileSaved") });
          setEditing(false);
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
      {!editing ? (
        <>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">
                {t("employeeDetail.fieldNationalId")}
              </dt>
              <dd className="text-text-primary">
                <MaskedValue permission="hr.salary.view" value={employee.national_id ?? "—"} />
              </dd>
            </div>
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">
                {t("employeeDetail.fieldEmploymentType")}
              </dt>
              <dd className="text-text-primary">{employee.employment_type}</dd>
            </div>
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">
                {t("employeeDetail.fieldHireDate")}
              </dt>
              <dd className="text-text-primary">{dateFormat.format(new Date(employee.hire_date))}</dd>
            </div>
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">
                {t("employeeDetail.fieldProbationEndDate")}
              </dt>
              <dd className="text-text-primary">
                {employee.probation_end_date ? dateFormat.format(new Date(employee.probation_end_date)) : "—"}
              </dd>
            </div>
          </dl>
          <div>
            <PermissionButton required="hr.employee.manage" onClick={() => setEditing(true)}>
              {t("employeeDetail.edit")}
            </PermissionButton>
          </div>
        </>
      ) : (
        <>
          <FormField label={t("employees.fieldFirstName")} required>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </FormField>
          <FormField label={t("employees.fieldLastName")} required>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </FormField>
          <FormField label={t("employees.fieldEmploymentType")} required>
            <Select value={employmentType} onValueChange={(value) => setEmploymentType(value as EmploymentType)}>
              <SelectTrigger aria-label={t("employees.fieldEmploymentType")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">{t("employees.employmentMonthly")}</SelectItem>
                <SelectItem value="DAILY">{t("employees.employmentDaily")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {t("employees.createCancel")}
            </Button>
            <Button onClick={handleSave} loading={updateEmployee.isPending}>
              {t("employeeDetail.save")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function DocumentsTab({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation("hr");
  const { toast } = useToast();
  const documentsQuery = useEmployeeDocumentsQuery(employeeId);
  const uploadDocument = useUploadEmployeeDocumentMutation();
  const documentUrl = useEmployeeDocumentUrlMutation();
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [docType, setDocType] = React.useState<EmployeeDocumentType>("OTHER");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const documents = documentsQuery.data?.body.documents ?? [];

  function handleFile(file: File | undefined) {
    if (!file) return;
    uploadDocument.mutate(
      { params: { id: employeeId }, body: { file, type: docType } },
      { onSuccess: () => toast({ tone: "success", title: t("employeeDetail.documentUploaded") }) },
    );
  }

  async function handleDownload(documentId: string) {
    setDownloadingId(documentId);
    try {
      const url = await documentUrl.mutateAsync({ id: employeeId, documentId });
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-2">
        {documents.length === 0 ? (
          <p className="text-sm text-text-muted">{t("employeeDetail.documentsEmpty")}</p>
        ) : (
          documents.map((document) => (
            <DocumentVaultRow
              key={document.id}
              document={{
                id: document.id,
                type: document.type,
                fileName: document.file_key.split("/").pop() ?? document.file_key,
                uploadedAt: document.uploaded_at,
              }}
              onDownload={() => handleDownload(document.id)}
              downloading={downloadingId === document.id}
            />
          ))
        )}
      </div>
      <div className="flex items-end gap-3">
        <FormField label={t("employeeDetail.documentType")} className="w-48">
          <Select value={docType} onValueChange={(value) => setDocType(value as EmployeeDocumentType)}>
            <SelectTrigger aria-label={t("employeeDetail.documentType")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ID_CARD">{t("employeeDetail.docIdCard")}</SelectItem>
              <SelectItem value="CONTRACT">{t("employeeDetail.docContract")}</SelectItem>
              <SelectItem value="CERTIFICATE">{t("employeeDetail.docCertificate")}</SelectItem>
              <SelectItem value="OTHER">{t("employeeDetail.docOther")}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <PermissionButton
          required="hr.employee.manage"
          onClick={() => inputRef.current?.click()}
          loading={uploadDocument.isPending}
        >
          {t("employeeDetail.uploadDocument")}
        </PermissionButton>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          aria-label={t("employeeDetail.uploadDocument")}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
    </section>
  );
}

function SalaryTab({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation("hr");
  const { toast } = useToast();
  const employeeQuery = useEmployeeQuery(employeeId);
  const addSalary = useAddSalaryRecordMutation();
  const employee = employeeQuery.data?.body.employee;

  const [amount, setAmount] = React.useState("");
  const [effectiveDate, setEffectiveDate] = React.useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    addSalary.mutate(
      { params: { id: employeeId }, body: { base_salary: amount, effective_date: effectiveDate } },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("employeeDetail.salaryAdded") });
          setAmount("");
          setEffectiveDate("");
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
      <div>
        <span className="text-caption uppercase tracking-wide text-text-muted">
          {t("employeeDetail.currentSalary")}
        </span>
        <div className="text-h3 font-semibold text-text-primary">
          <MaskedValue
            permission="hr.salary.view"
            value={employee?.base_salary ? <MoneyCell value={employee.base_salary} /> : "—"}
          />
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <FormField label={t("employeeDetail.newSalaryAmount")} required>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </FormField>
        <FormField label={t("employeeDetail.effectiveDate")} required>
          <Input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            required
          />
        </FormField>
        <PermissionButton required="hr.salary.edit" type="submit" loading={addSalary.isPending}>
          {t("employeeDetail.addSalaryRecord")}
        </PermissionButton>
      </form>
    </section>
  );
}
