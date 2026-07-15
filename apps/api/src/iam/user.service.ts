import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  role,
  session,
  user,
  userRole,
  type Db,
  type UserStatus,
} from "@erp/db";
import type {
  CreateUserRequest,
  RoleRef,
  SetUserRolesRequest,
  User,
} from "@erp/contracts";
import { tryDecodeCursor } from "@erp/utils";
import { PasswordService } from "../auth/password.service.js";
import type { AuthUser } from "../auth/auth-user.js";
import { buildPage } from "../common/pagination/cursor.js";
import { NotFoundError, StateConflictError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";

interface UserCursor {
  createdAt: string;
  id: string;
}

/**
 * User administration (spec §1.5). `setRoles` and `forceLogout` bump the user's
 * `permissions_version` (instant revocation, design D2); `forceLogout` additionally
 * revokes every live session. Each mutation emits an audit event —
 * `PERMISSION_CHANGE` for role/status edits, `FORCE_LOGOUT` for force-logout.
 */
@Injectable()
export class UserService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly passwords: PasswordService,
    private readonly uow: UnitOfWork,
    private readonly events: EventBusService,
  ) {}

  /** Cursor-paginated user list, newest first, with an optional status filter. */
  async list(
    limit: number,
    cursor: string | undefined,
    status: UserStatus | undefined,
  ): Promise<{ data: User[]; next_cursor: string | null }> {
    const ex = currentExecutor(this.db);
    const decoded = cursor
      ? (tryDecodeCursor(cursor) as UserCursor | null)
      : null;

    const filters = [
      status ? eq(user.status, status) : undefined,
      decoded
        ? sql`(${user.createdAt}, ${user.id}) < (${new Date(decoded.createdAt)}, ${decoded.id})`
        : undefined,
    ].filter(Boolean);

    const rows = await ex
      .select({
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        isSuperAdmin: user.isSuperAdmin,
        employeeId: user.employeeId,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(limit + 1);

    const page = buildPage(rows, limit, (r) => ({
      createdAt: r.createdAt.toISOString(),
      id: r.id,
    }));

    const rolesByUser = await this.rolesFor(page.data.map((r) => r.id));
    const data: User[] = page.data.map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email,
      status: r.status,
      is_super_admin: r.isSuperAdmin,
      employee_id: r.employeeId,
      roles: rolesByUser.get(r.id) ?? [],
      last_login_at: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
    }));

    return { data, next_cursor: page.next_cursor };
  }

  async create(input: CreateUserRequest, actor: AuthUser): Promise<User> {
    const passwordHash = await this.passwords.hash(input.temp_password);
    return this.uow.withTransaction(async () => {
      const ex = currentExecutor(this.db);
      const [created] = await ex
        .insert(user)
        .values({
          username: input.username,
          email: input.email,
          employeeId: input.employee_id ?? null,
          passwordHash,
          // Provisioned active with a temporary password (design D3).
          status: "ACTIVE",
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning({ id: user.id });
      if (!created) throw new StateConflictError("User could not be created");

      await this.assignRoles(created.id, input.role_ids);
      const snapshot = await this.loadUser(created.id);
      await this.auditPermissionChange(actor, created.id, null, snapshot.roles);
      return snapshot;
    });
  }

  async setRoles(
    id: string,
    input: SetUserRolesRequest,
    actor: AuthUser,
  ): Promise<User> {
    return this.uow.withTransaction(async () => {
      const before = await this.loadUser(id);
      const ex = currentExecutor(this.db);
      await ex.delete(userRole).where(eq(userRole.userId, id));
      await this.assignRoles(id, input.role_ids);
      // Effective permissions changed → invalidate live tokens (design D2).
      await ex
        .update(user)
        .set({ permissionsVersion: sql`${user.permissionsVersion} + 1` })
        .where(eq(user.id, id));

      const after = await this.loadUser(id);
      await this.auditPermissionChange(actor, id, before.roles, after.roles);
      return after;
    });
  }

  /** Revoke every live session and bump the version — the user's tokens all 401. */
  async forceLogout(id: string, actor: AuthUser): Promise<void> {
    await this.uow.withTransaction(async () => {
      const ex = currentExecutor(this.db);
      const [target] = await ex
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, id))
        .limit(1);
      if (!target) throw new NotFoundError("User not found");

      const revoked = await ex
        .update(session)
        .set({ revokedAt: new Date() })
        .where(and(eq(session.userId, id), isNull(session.revokedAt)))
        .returning({ id: session.id });

      await ex
        .update(user)
        .set({ permissionsVersion: sql`${user.permissionsVersion} + 1` })
        .where(eq(user.id, id));

      await this.events.publishInTransaction(
        makeEvent({
          event: "iam.user.force_logout",
          actorUserId: actor.id,
          payload: {
            audit: {
              action: "FORCE_LOGOUT" as const,
              entityType: "user",
              entityId: id,
              actorUserId: actor.id,
              after: { sessions_revoked: revoked.length },
            },
          },
        }),
      );
    });
  }

  async setStatus(
    id: string,
    status: UserStatus,
    actor: AuthUser,
  ): Promise<User> {
    return this.uow.withTransaction(async () => {
      const before = await this.loadUser(id);
      const ex = currentExecutor(this.db);
      await ex
        .update(user)
        .set({ status, updatedBy: actor.id, updatedAt: new Date() })
        .where(eq(user.id, id));

      const after = await this.loadUser(id);
      await this.events.publishInTransaction(
        makeEvent({
          event: "iam.user.status_changed",
          actorUserId: actor.id,
          payload: {
            audit: {
              action: "PERMISSION_CHANGE" as const,
              entityType: "user",
              entityId: id,
              actorUserId: actor.id,
              before: { status: before.status },
              after: { status: after.status },
            },
          },
        }),
      );
      return after;
    });
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private async loadUser(id: string): Promise<User> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        isSuperAdmin: user.isSuperAdmin,
        employeeId: user.employeeId,
        lastLoginAt: user.lastLoginAt,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    if (!row) throw new NotFoundError("User not found");

    const roles = (await this.rolesFor([id])).get(id) ?? [];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      status: row.status,
      is_super_admin: row.isSuperAdmin,
      employee_id: row.employeeId,
      roles,
      last_login_at: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    };
  }

  /** Load the role refs for a set of user ids, grouped by user id. */
  private async rolesFor(userIds: string[]): Promise<Map<string, RoleRef[]>> {
    const map = new Map<string, RoleRef[]>();
    if (userIds.length === 0) return map;
    const rows = await currentExecutor(this.db)
      .select({ userId: userRole.userId, id: role.id, name: role.name })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(inArray(userRole.userId, userIds))
      .orderBy(role.name);
    for (const r of rows) {
      const list = map.get(r.userId) ?? [];
      list.push({ id: r.id, name: r.name });
      map.set(r.userId, list);
    }
    return map;
  }

  /** Insert `user_role` rows, validating that every role id exists. */
  private async assignRoles(userId: string, roleIds: string[]): Promise<void> {
    const unique = [...new Set(roleIds)];
    if (unique.length === 0) return;
    const ex = currentExecutor(this.db);
    const found = await ex
      .select({ id: role.id })
      .from(role)
      .where(inArray(role.id, unique));
    if (found.length !== unique.length) {
      throw new NotFoundError("One or more roles do not exist");
    }
    await ex
      .insert(userRole)
      .values(unique.map((roleId) => ({ userId, roleId })));
  }

  private async auditPermissionChange(
    actor: AuthUser,
    userId: string,
    before: RoleRef[] | null,
    after: RoleRef[] | null,
  ): Promise<void> {
    await this.events.publishInTransaction(
      makeEvent({
        event: "iam.user.roles_changed",
        actorUserId: actor.id,
        payload: {
          audit: {
            action: "PERMISSION_CHANGE" as const,
            entityType: "user",
            entityId: userId,
            actorUserId: actor.id,
            before: before ? { role_ids: before.map((r) => r.id) } : null,
            after: after ? { role_ids: after.map((r) => r.id) } : null,
          },
        },
      }),
    );
  }
}
