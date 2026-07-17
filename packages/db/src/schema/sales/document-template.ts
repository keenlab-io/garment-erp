import { sql } from "drizzle-orm";
import { boolean, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

// Document rendering template (spec §5.2, design D10) — `layout` is a free-form jsonb bag;
// `logo_key`/`signature_key`/`stamp_key` are object-storage keys resolved through
// `StorageService`. Exports use the `is_active` template.
export const documentTemplate = pgTable("document_template", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text().notNull(),
  layout: jsonb().notNull().default({}),
  logoKey: text(),
  signatureKey: text(),
  stampKey: text(),
  isActive: boolean().notNull().default(true),
});
