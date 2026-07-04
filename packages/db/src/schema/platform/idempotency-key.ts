import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Idempotency records, keyed per user: the same `key` from two different users are
// independent, but a repeat of the same `(key, user_id)` replays the stored
// response. `requestHash` lets the interceptor reject a reused key with a different
// request body.
export const idempotencyKey = pgTable(
  "idempotency_key",
  {
    key: text().notNull(),
    userId: uuid().notNull(),
    requestHash: text().notNull(),
    responseStatus: integer(),
    responseBody: jsonb(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.key, t.userId] })],
);
