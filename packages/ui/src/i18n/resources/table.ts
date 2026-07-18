// `table` namespace — @erp/ui's own default copy for the DataTable organism's built-in strings
// (pagination, bulk-selection bar, column menu, error/empty states). Same sharing model as
// `common.ts`: the host app imports these into its i18next resources bundle (M0 §7).
export const tableEn = {
  selectAll: "Select all rows",
  selectRow: "Select row",
  // `{{n}}` (not `{{count}}`) avoids i18next's automatic cardinal-plural key resolution — the
  // phrase doesn't change shape with count in either locale, so one template is correct for both.
  selectedCount: "{{n}} selected",
  clearSelection: "Clear",
  columns: "Columns",
  savePreset: "Save view",
  resetPreset: "Reset",
  previousPage: "Previous",
  nextPage: "Next",
  endOfList: "End of list",
  rowActions: "Row actions",
  retry: "Retry",
  errorTitle: "Couldn't load this list",
  emptyTitle: "Nothing here yet",
} as const;

export type TableMessages = typeof tableEn;

export const tableTh: Record<keyof TableMessages, string> = {
  selectAll: "เลือกทุกแถว",
  selectRow: "เลือกแถว",
  selectedCount: "เลือกแล้ว {{n}} รายการ",
  clearSelection: "ล้างการเลือก",
  columns: "คอลัมน์",
  savePreset: "บันทึกมุมมอง",
  resetPreset: "รีเซ็ต",
  previousPage: "ก่อนหน้า",
  nextPage: "ถัดไป",
  endOfList: "สิ้นสุดรายการ",
  rowActions: "การทำงานของแถว",
  retry: "ลองอีกครั้ง",
  errorTitle: "โหลดรายการนี้ไม่สำเร็จ",
  emptyTitle: "ยังไม่มีข้อมูล",
};
