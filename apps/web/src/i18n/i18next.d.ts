import type { CommonMessages, TableMessages } from "@erp/ui";
import type { shellEn, iamEn, hrEn, inventoryEn, productionEn } from "./resources/en";

// i18next TS resource augmentation (M0 §7.2): a key that doesn't exist in `shell`/`common`/`table`/
// `iam`/`hr`/`inventory`/`production` fails typecheck at the `t()` call site. `common`/`table` reuse
// @erp/ui's own message types so the app and the package can never drift on those two namespaces'
// key shapes.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "shell";
    resources: {
      shell: typeof shellEn;
      common: CommonMessages;
      table: TableMessages;
      iam: typeof iamEn;
      hr: typeof hrEn;
      inventory: typeof inventoryEn;
      production: typeof productionEn;
    };
  }
}
