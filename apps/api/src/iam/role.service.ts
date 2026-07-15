import { Inject, Injectable } from "@nestjs/common";
import { eq, inArray, sql } from "drizzle-orm";
import {
  permission,
  role,
  rolePermission,
  user,
  userRole,
  type Db,
} from "@erp/db";
import type {
  CloneRoleRequest,
  CreateRoleRequest,
  Permission,
  Role,
  RoleSummary,
  UpdateRoleRequest,
} from "@erp/contracts";
import { PasswordService } from "../auth/password.service.js";
import type { AuthUser } from "../auth/auth-user.js";
import {
  ForbiddenError,
  NotFoundError,
  StateConflictError,
  ValidationError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";

/**
 * Role administration (spec §1.5). Every mutation runs in one transaction, bumps the
 * `permissions_version` of affected users where the effective permission set changes
 * (instant revocation, design D2), and emits a `PERMISSION_CHANGE` audit event.
 * Deleting a role additionally requires Super-Admin re-auth and is blocked while any
 * user is still bound (design D6).
 */
@Injectable()
export class RoleService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly passwords: PasswordService,
    private readonly uow: UnitOfWork,
    private readonly events: EventBusService,
  ) {}

  /** List roles with their permission and bound-user counts. */
  async list(): Promise<RoleSummary[]> {
    const ex = currentExecutor(this.db);
    const rows = await ex
      .select({
        id: role.id,
        name: role.name,
        permission_count: sql<number>`(select count(*) from ${rolePermission} where ${rolePermission.roleId} = ${role.id})::int`,
        user_count: sql<number>`(select count(*) from ${userRole} where ${userRole.roleId} = ${role.id})::int`,
      })
      .from(role)
      .orderBy(role.name);
    return rows;
  }

  async create(input: CreateRoleRequest, actor: AuthUser): Promise<Role> {
    return this.uow.withTransaction(async () => {
      const ex = currentExecutor(this.db);
      const [created] = await ex
        .insert(role)
        .values({
          name: input.name,
          description: input.description ?? null,
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning({ id: role.id });
      if (!created) throw new StateConflictError("Role could not be created");

      await this.replacePermissions(created.id, input.permission_codes);
      const snapshot = await this.loadRole(created.id);

      await this.auditPermissionChange(actor, created.id, null, snapshot);
      return snapshot;
    });
  }

  async update(
    id: string,
    input: UpdateRoleRequest,
    actor: AuthUser,
  ): Promise<Role> {
    return this.uow.withTransaction(async () => {
      const ex = currentExecutor(this.db);
      const before = await this.loadRole(id);

      await ex
        .update(role)
        .set({
          name: input.name ?? before.name,
          description:
            input.description === undefined
              ? before.description
              : input.description,
          updatedBy: actor.id,
          updatedAt: new Date(),
          version: sql`${role.version} + 1`,
        })
        .where(eq(role.id, id));

      if (input.permission_codes !== undefined) {
        await this.replacePermissions(id, input.permission_codes);
        // The effective permission set changed → log out every bound user.
        await this.bumpBoundUsers(id);
      }

      const after = await this.loadRole(id);
      await this.auditPermissionChange(actor, id, before, after);
      return after;
    });
  }

  async clone(
    id: string,
    input: CloneRoleRequest,
    actor: AuthUser,
  ): Promise<Role> {
    return this.uow.withTransaction(async () => {
      const ex = currentExecutor(this.db);
      const source = await this.loadRole(id);

      const [created] = await ex
        .insert(role)
        .values({
          name: input.name,
          description: source.description,
          clonedFrom: id,
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning({ id: role.id });
      if (!created) throw new StateConflictError("Role could not be cloned");

      await this.replacePermissions(created.id, source.permission_codes);
      const snapshot = await this.loadRole(created.id);

      await this.auditPermissionChange(actor, created.id, null, snapshot);
      return snapshot;
    });
  }

  /**
   * Delete a role. Requires the caller to re-authenticate with their own password
   * (`super_admin_password`); a mismatch is a 403 and writes nothing. System roles
   * are never deletable, and a role still bound to any user yields a 409.
   */
  async delete(
    id: string,
    superAdminPassword: string,
    actor: AuthUser,
  ): Promise<void> {
    await this.uow.withTransaction(async () => {
      const ex = currentExecutor(this.db);

      // Re-auth FIRST so a bad password aborts before any read/write or audit row.
      const [caller] = await ex
        .select({ passwordHash: user.passwordHash })
        .from(user)
        .where(eq(user.id, actor.id))
        .limit(1);
      const ok =
        caller !== undefined &&
        (await this.passwords.verify(caller.passwordHash, superAdminPassword));
      // Spec §1.5 wants 403 for a bad password. M0's filter maps REAUTH_REQUIRED → 401,
      // so we use ForbiddenError (→ 403) rather than ReauthRequiredError here.
      if (!ok) throw new ForbiddenError("Super-Admin re-authentication failed");

      const before = await this.loadRole(id);
      if (before.is_system) {
        throw new StateConflictError("System roles cannot be deleted");
      }

      const boundRows = await ex
        .select({ bound: sql<number>`count(*)::int` })
        .from(userRole)
        .where(eq(userRole.roleId, id));
      if ((boundRows[0]?.bound ?? 0) > 0) {
        throw new StateConflictError("Role is still assigned to users");
      }

      await ex.delete(role).where(eq(role.id, id));
      await this.auditPermissionChange(actor, id, before, null);
    });
  }

  // ── internals ───────────────────────────────────────────────────────────────

  /** Load a role with its full permission-code set; 404 if absent. */
  private async loadRole(id: string): Promise<Role> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({
        id: role.id,
        name: role.name,
        description: role.description,
        is_system: role.isSystem,
        cloned_from: role.clonedFrom,
      })
      .from(role)
      .where(eq(role.id, id))
      .limit(1);
    if (!row) throw new NotFoundError("Role not found");

    const codes = await ex
      .select({ code: permission.code })
      .from(rolePermission)
      .innerJoin(permission, eq(permission.id, rolePermission.permissionId))
      .where(eq(rolePermission.roleId, id));

    return { ...row, permission_codes: codes.map((c) => c.code as Permission) };
  }

  /** Replace a role's grants with exactly the given codes (validated against the catalog). */
  private async replacePermissions(
    roleId: string,
    codes: Permission[],
  ): Promise<void> {
    const ex = currentExecutor(this.db);
    await ex.delete(rolePermission).where(eq(rolePermission.roleId, roleId));
    const unique = [...new Set(codes)];
    if (unique.length === 0) return;

    const perms = await ex
      .select({ id: permission.id, code: permission.code })
      .from(permission)
      .where(inArray(permission.code, unique));

    const missing = unique.filter((c) => !perms.some((p) => p.code === c));
    if (missing.length > 0) {
      throw new ValidationError("Unknown permission code(s)", [
        { field: "permission_codes", issue: missing.join(", ") },
      ]);
    }

    await ex
      .insert(rolePermission)
      .values(perms.map((p) => ({ roleId, permissionId: p.id })));
  }

  /** Bump `permissions_version` for every user bound to the role. */
  private async bumpBoundUsers(roleId: string): Promise<void> {
    const ex = currentExecutor(this.db);
    await ex
      .update(user)
      .set({ permissionsVersion: sql`${user.permissionsVersion} + 1` })
      .where(
        inArray(
          user.id,
          ex
            .select({ id: userRole.userId })
            .from(userRole)
            .where(eq(userRole.roleId, roleId)),
        ),
      );
  }

  /** Emit the `PERMISSION_CHANGE` audit event for a role mutation. */
  private async auditPermissionChange(
    actor: AuthUser,
    roleId: string,
    before: Role | null,
    after: Role | null,
  ): Promise<void> {
    await this.events.publishInTransaction(
      makeEvent({
        event: "iam.role.changed",
        actorUserId: actor.id,
        payload: {
          audit: {
            action: "PERMISSION_CHANGE" as const,
            entityType: "role",
            entityId: roleId,
            actorUserId: actor.id,
            before,
            after,
          },
        },
      }),
    );
  }
}
