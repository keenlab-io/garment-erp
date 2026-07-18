// `common` namespace — @erp/ui's own default copy for reusable primitives (dialogs, toasts).
// The host app (apps/web) imports these same objects into its i18next resources bundle so the
// package and the app share one namespace instead of duplicating translations (M0 §7).
export const commonEn = {
  actions: {
    confirm: "Confirm",
    cancel: "Cancel",
    close: "Close",
    dismiss: "Dismiss",
    retry: "Retry",
  },
  confirmDialog: {
    reasonLabel: "Reason",
    reasonPlaceholder: "Explain why",
    reasonRequired: "A reason is required.",
    passwordLabel: "Super-Admin password",
    passwordPlaceholder: "Re-enter to authorize",
  },
} as const;

export type CommonMessages = typeof commonEn;

// Same key structure as the English resources (a missing/extra key is a compile error).
type Messages<T> = { [K in keyof T]: T[K] extends string ? string : Messages<T[K]> };

export const commonTh: Messages<CommonMessages> = {
  actions: {
    confirm: "ยืนยัน",
    cancel: "ยกเลิก",
    close: "ปิด",
    dismiss: "ปิดการแจ้งเตือน",
    retry: "ลองอีกครั้ง",
  },
  confirmDialog: {
    reasonLabel: "เหตุผล",
    reasonPlaceholder: "อธิบายเหตุผล",
    reasonRequired: "กรุณาระบุเหตุผล",
    passwordLabel: "รหัสผ่านผู้ดูแลสูงสุด",
    passwordPlaceholder: "กรอกรหัสผ่านอีกครั้งเพื่อยืนยันตัวตน",
  },
};
