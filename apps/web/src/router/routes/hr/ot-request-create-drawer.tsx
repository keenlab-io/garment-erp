import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Combobox,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from "@erp/ui";
import {
  useCreateOtRequestMutation,
  useEmployeesQuery,
  useSubmitOtRequestMutation,
} from "../../../hr/queries.js";

/** Valid OT rate keys — must match the `ot_rate` config seed (packages/db seed). */
const RATE_TYPES = ["WEEKDAY_1_5", "HOLIDAY_1_0", "HOLIDAY_3_0"] as const;

/**
 * Create-OT-request form (M2 §4.3): a drawer that creates a DRAFT then immediately submits it into
 * the approval queue. There is no draft-management UI, so create and submit are one action. Gated
 * upstream by the `hr.employee.manage` PermissionButton that opens it.
 */
export function CreateOtRequestDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("hr");
  const { toast } = useToast();
  const employees = useEmployeesQuery({ limit: 100 });
  const createOt = useCreateOtRequestMutation();
  const submitOt = useSubmitOtRequestMutation();

  const [employeeId, setEmployeeId] = React.useState("");
  const [workDate, setWorkDate] = React.useState("");
  const [startTime, setStartTime] = React.useState("");
  const [endTime, setEndTime] = React.useState("");
  const [rateType, setRateType] = React.useState<string>("WEEKDAY_1_5");
  const [reason, setReason] = React.useState("");
  const [employeeError, setEmployeeError] = React.useState<string | null>(null);
  const [timeError, setTimeError] = React.useState<string | null>(null);
  // Holds the DRAFT id once created, so a retry after a failed submit resumes at submit
  // rather than creating a second draft. Cleared on a fresh open and on clean success.
  const createdIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setEmployeeId("");
      setWorkDate("");
      setStartTime("");
      setEndTime("");
      setRateType("WEEKDAY_1_5");
      setReason("");
      setEmployeeError(null);
      setTimeError(null);
      createdIdRef.current = null;
    }
  }, [open]);

  const employeeOptions = (employees.data?.body.data ?? []).map((e) => ({
    value: e.id,
    label: `${e.first_name} ${e.last_name}`,
  }));

  const rateLabel: Record<(typeof RATE_TYPES)[number], string> = {
    WEEKDAY_1_5: t("otCreate.rateWeekday15"),
    HOLIDAY_1_0: t("otCreate.rateHoliday10"),
    HOLIDAY_3_0: t("otCreate.rateHoliday30"),
  };

  const pending = createOt.isPending || submitOt.isPending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    let invalid = false;
    if (!employeeId) {
      setEmployeeError(t("otCreate.employeeRequired"));
      invalid = true;
    } else {
      setEmployeeError(null);
    }
    if (startTime && endTime && endTime <= startTime) {
      setTimeError(t("otCreate.endBeforeStart"));
      invalid = true;
    } else {
      setTimeError(null);
    }
    if (invalid) return;

    if (!createdIdRef.current) {
      try {
        const created = await createOt.mutateAsync({
          body: {
            employee_id: employeeId,
            work_date: workDate,
            start_time: startTime,
            end_time: endTime,
            rate_type: rateType,
            reason: reason.trim() || undefined,
          },
        });
        createdIdRef.current = created.body.ot_request.id;
      } catch {
        toast({ tone: "danger", title: t("otCreate.createError") });
        return;
      }
    }

    try {
      await submitOt.mutateAsync({ params: { id: createdIdRef.current }, body: undefined });
    } catch {
      toast({ tone: "danger", title: t("otCreate.submitError") });
      return;
    }

    createdIdRef.current = null;
    toast({ tone: "success", title: t("otCreate.submitted") });
    onOpenChange(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <DrawerHeader>
            <DrawerTitle className="text-h3 font-semibold text-text-primary">
              {t("otCreate.title")}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="flex flex-col gap-4">
            <FormField label={t("otCreate.fieldEmployee")} required error={employeeError ?? undefined}>
              <Combobox
                value={employeeId}
                onValueChange={setEmployeeId}
                options={employeeOptions}
                loading={employees.isLoading}
                aria-label={t("otCreate.fieldEmployee")}
              />
            </FormField>
            <FormField label={t("otCreate.fieldWorkDate")} required>
              <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required />
            </FormField>
            <FormField label={t("otCreate.fieldStartTime")} required>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </FormField>
            <FormField label={t("otCreate.fieldEndTime")} required error={timeError ?? undefined}>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </FormField>
            <FormField label={t("otCreate.fieldRateType")} required>
              <Select value={rateType} onValueChange={setRateType}>
                <SelectTrigger aria-label={t("otCreate.fieldRateType")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATE_TYPES.map((rt) => (
                    <SelectItem key={rt} value={rt}>
                      {rateLabel[rt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("otCreate.fieldReason")}>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
          </DrawerBody>
          <DrawerFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("otCreate.cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {t("otCreate.submit")}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
