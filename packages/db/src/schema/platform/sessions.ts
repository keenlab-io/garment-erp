import { sql } from "drizzle-orm";
import { index, inet, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./users.js";

// Auth session — one row per issued token pair. `tokenId` is the JWT jti;
// `permissionsVersion` snapshots the user's version at issuance so the guard can
// detect instant revocation. The partial index keeps active-session lookups off
// the revoked rows.
export const session = pgTable(
  "session",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => user.id),
    tokenId: text().notNull(),
    permissionsVersion: integer().notNull(),
    ip: inet(),
    userAgent: text(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("session_active_token_idx")
      .on(t.tokenId)
      .where(sql`${t.revokedAt} is null`),
  ],
);
