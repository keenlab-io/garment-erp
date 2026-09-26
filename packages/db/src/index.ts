// Public surface of @erp/db: the client factory + types, the shared column
// builders, the full schema (individually and under the `schema` namespace), and the
// per-tenant default seeding shared by the dev seed, provisioning, and self-hosted boot.
export * from "./client.js";
export * from "./base-columns.js";
export * from "./schema/index.js";
export * as schema from "./schema/index.js";
export * from "./seed/tenant-defaults.js";
