import type { CommonMessages } from "./resources/common.js";
import type { TableMessages } from "./resources/table.js";

// Types `useTranslation()`/`t()` calls inside @erp/ui against its own two namespaces so an unknown
// key fails typecheck (M0 §7.2). The host app declares its own augmentation covering the full
// namespace set (including `shell`), importing these same `*Messages` types for the shared ones.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: CommonMessages;
      table: TableMessages;
    };
  }
}
