import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { session, user, type Db } from "@erp/db";
import type { Permission } from "@erp/contracts";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import type {
  AuthSessionRecord,
  AuthUserRecord,
  PermissionResolver,
  SessionLookup,
  UserLookup,
} from "./auth.tokens.js";

/** Default `USER_LOOKUP` — reads the platform `user` table. */
@Injectable()
export class DefaultUserLookup implements UserLookup {
  constructor(@Inject(DB) private readonly db: Db) {}

  async byId(id: string): Promise<AuthUserRecord | null> {
    const rows = await currentExecutor(this.db)
      .select({
        id: user.id,
        status: user.status,
        permissionsVersion: user.permissionsVersion,
        isSuperAdmin: user.isSuperAdmin,
        lockedUntil: user.lockedUntil,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    return rows[0] ?? null;
  }
}

/** Default `SESSION_LOOKUP` — reads the platform `session` table. */
@Injectable()
export class DefaultSessionLookup implements SessionLookup {
  constructor(@Inject(DB) private readonly db: Db) {}

  async byTokenId(tokenId: string): Promise<AuthSessionRecord | null> {
    const rows = await currentExecutor(this.db)
      .select({
        id: session.id,
        userId: session.userId,
        tokenId: session.tokenId,
        permissionsVersion: session.permissionsVersion,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
      })
      .from(session)
      .where(eq(session.tokenId, tokenId))
      .limit(1);
    return rows[0] ?? null;
  }
}

/**
 * Default `PERMISSION_RESOLVER` — M0 has no role model, so every non-super-admin
 * resolves to the empty set (design D6). M1 rebinds this token.
 */
@Injectable()
export class DefaultPermissionResolver implements PermissionResolver {
  async resolve(_userId: string): Promise<ReadonlySet<Permission>> {
    return new Set<Permission>();
  }
}
