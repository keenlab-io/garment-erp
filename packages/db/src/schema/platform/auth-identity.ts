import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { auditColumns, citext } from "../../base-columns.js";
import type { AuthProvider } from "../enums.js";
import { tenant } from "./tenant.js";
import { user } from "./users.js";

// How a user can sign in (M10 design D8). A PASSWORD row (subject = username) exists for every
// user so "how can this user authenticate" is one uniform query; the argon2id hash itself stays
// on `user.password_hash`. GOOGLE rows hold the OIDC `sub`. Deliberately TENANT_EXEMPT: it
// carries `tenant_id` as a plain FK (no `tenantColumn` default, no RLS) because the demo-pool
// callback must resolve a Google `sub` across DEMO_SANDBOX tenants before any tenant context
// exists. Access is confined to the auth layer; never exposed via a list endpoint.
// Rows die with their user (ON DELETE CASCADE) — the sandbox purge relies on it.
export const authIdentity = pgTable(
  "auth_identity",
  {
    ...auditColumns,
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text().$type<AuthProvider>().notNull(),
    subject: citext().notNull(),
    email: citext(),
    lastLoginAt: timestamp({ withTimezone: true }),
  },
  (t) => [unique("auth_identity_tenant_provider_subject_uq").on(t.tenantId, t.provider, t.subject)],
);
