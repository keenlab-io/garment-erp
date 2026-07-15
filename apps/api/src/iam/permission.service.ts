import { Inject, Injectable } from "@nestjs/common";
import { inArray } from "drizzle-orm";
import { permission, roleTemplate, type Db } from "@erp/db";
import type {
  CreateRoleTemplateRequest,
  Permission,
  PermissionEntry,
  RoleTemplate,
} from "@erp/contracts";
import type { AuthUser } from "../auth/auth-user.js";
import { ValidationError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";

/**
 * The permission catalog (`GET /permissions`) and role-template creation (spec §1.5).
 * The catalog is the persisted `permission` table — the seeded mirror of the
 * `@erp/contracts` `PERMISSIONS` array (design D8). Template creation validates every
 * referenced code against that table (design Open Question 2: strict validation).
 */
@Injectable()
export class PermissionService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly events: EventBusService,
  ) {}

  /** The permission catalog, ordered by code. */
  async listCatalog(): Promise<PermissionEntry[]> {
    const rows = await currentExecutor(this.db)
      .select({ code: permission.code })
      .from(permission)
      .orderBy(permission.code);
    return rows.map((r) => ({ code: r.code as Permission }));
  }

  async createTemplate(
    input: CreateRoleTemplateRequest,
    actor: AuthUser,
  ): Promise<RoleTemplate> {
    return this.uow.withTransaction(async () => {
      const ex = currentExecutor(this.db);
      const unique = [...new Set(input.permission_codes)];
      const perms = unique.length
        ? await ex
            .select({ id: permission.id, code: permission.code })
            .from(permission)
            .where(inArray(permission.code, unique))
        : [];

      const missing = unique.filter((c) => !perms.some((p) => p.code === c));
      if (missing.length > 0) {
        throw new ValidationError("Unknown permission code(s)", [
          { field: "permission_codes", issue: missing.join(", ") },
        ]);
      }

      const [created] = await ex
        .insert(roleTemplate)
        .values({
          name: input.name,
          defaultPermissionIds: perms.map((p) => p.id),
        })
        .returning({ id: roleTemplate.id, name: roleTemplate.name });
      if (!created) throw new ValidationError("Template could not be created");

      await this.events.publishInTransaction(
        makeEvent({
          event: "iam.role_template.created",
          actorUserId: actor.id,
          payload: {
            audit: {
              action: "CREATE" as const,
              entityType: "role_template",
              entityId: created.id,
              actorUserId: actor.id,
              after: { name: created.name, permission_codes: unique },
            },
          },
        }),
      );

      return {
        id: created.id,
        name: created.name,
        permission_codes: perms.map((p) => p.code as Permission),
      };
    });
  }
}
