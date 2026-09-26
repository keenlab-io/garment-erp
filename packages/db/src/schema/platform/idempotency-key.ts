import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantColumn } from "../../base-columns.js";
import { tenantFk } from "./tenant.js";

// Idempotency records, keyed per tenant and user: the same `key` from two different
// users (or tenants) are independent, but a repeat of the same `(tenant_id, key, user_id)`
// replays the stored response. `requestHash` lets the interceptor reject a reused key with a different
// request body.
export const idempotencyKey = pgTable(
  "idempotency_key",
  {
    ...tenantColumn,
    key: text().notNull(),
    userId: uuid().notNull(),
    requestHash: text().notNull(),
    responseStatus: integer(),
    responseBody: jsonb(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [tenantFk(t), primaryKey({ columns: [t.tenantId, t.key, t.userId] })],
);
