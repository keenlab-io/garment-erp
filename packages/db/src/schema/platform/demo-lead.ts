import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { auditColumns, citext } from "../../base-columns.js";

// Opt-in lead capture from the public demo (M10 design D6). Control-plane (TENANT_EXEMPT):
// written by the sandbox purge only when the guest ticked the consent box, so it outlives the
// sandbox. Holds the one piece of guest PII that is allowed to survive, with proof of consent.
export const demoLead = pgTable("demo_lead", {
  ...auditColumns,
  email: citext().notNull(),
  name: text().notNull(),
  consentedAt: timestamp({ withTimezone: true }).notNull(),
});
