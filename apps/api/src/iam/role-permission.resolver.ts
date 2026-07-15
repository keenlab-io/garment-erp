import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { permission, rolePermission, userRole, type Db } from "@erp/db";
import type { Permission } from "@erp/contracts";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import type { PermissionResolver } from "../auth/auth.tokens.js";

/**
 * M1 `PERMISSION_RESOLVER` (design D1). Returns the union of `permission.code` across
 * every role bound to the user (`user_role ⋈ role_permission ⋈ permission`), read
 * through `currentExecutor(db)` so it honors any ambient transaction. `IamModule`
 * binds this to the `PERMISSION_RESOLVER` token, overriding M0's empty-set default —
 * the only wiring change needed for the global `JwtGuard` to enforce real permissions.
 */
@Injectable()
export class RolePermissionResolver implements PermissionResolver {
  constructor(@Inject(DB) private readonly db: Db) {}

  async resolve(userId: string): Promise<ReadonlySet<Permission>> {
    const rows = await currentExecutor(this.db)
      .selectDistinct({ code: permission.code })
      .from(userRole)
      .innerJoin(rolePermission, eq(rolePermission.roleId, userRole.roleId))
      .innerJoin(permission, eq(permission.id, rolePermission.permissionId))
      .where(eq(userRole.userId, userId));
    return new Set(rows.map((r) => r.code as Permission));
  }
}
