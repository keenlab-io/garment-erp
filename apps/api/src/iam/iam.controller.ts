import {
  Controller,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { contract } from "@erp/contracts";
import { assertPermissions } from "../auth/authz.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/auth-user.js";
import { ValidationError } from "../common/errors/app-exception.js";
import { AuthService } from "./auth.service.js";
import { AuditQueryService } from "./audit-query.service.js";
import { ImportService } from "./import.service.js";
import { PermissionService } from "./permission.service.js";
import { RoleService } from "./role.service.js";
import { UserService } from "./user.service.js";

/** The uploaded-file shape multer attaches (a subset of `Express.Multer.File`). */
interface UploadedExcel {
  buffer: Buffer;
  originalname: string;
}

/**
 * The authenticated IAM surface (spec §1.7): session (`logout`/`me`), role & user
 * administration, the permission catalog, templates, Excel import, and the audit
 * query. Each handler authorizes in-handler via `assertPermissions(...)` (M0 design
 * D7 — the guards can't read per-route metadata on ts-rest handlers). login/refresh
 * live in `IamAuthController` (public).
 */
@Controller()
export class IamController {
  constructor(
    private readonly auth: AuthService,
    private readonly roles: RoleService,
    private readonly users: UserService,
    private readonly permissions: PermissionService,
    private readonly imports: ImportService,
    private readonly audit: AuditQueryService,
  ) {}

  // ── Session ───────────────────────────────────────────────────────────────

  @TsRestHandler(contract.iam.logout)
  logout(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.logout, async () => {
      await this.auth.logout(user.sessionId);
      return { status: 204, body: undefined };
    });
  }

  @TsRestHandler(contract.iam.me)
  me(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.me, async () => ({
      status: 200,
      body: await this.auth.me(user),
    }));
  }

  // ── Roles & permissions ─────────────────────────────────────────────────────

  @TsRestHandler(contract.iam.listRoles)
  listRoles(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.listRoles, async () => {
      assertPermissions(user, "iam.role.manage");
      return { status: 200, body: await this.roles.list() };
    });
  }

  @TsRestHandler(contract.iam.createRole)
  createRole(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.createRole, async ({ body }) => {
      assertPermissions(user, "iam.role.manage");
      return { status: 201, body: { role: await this.roles.create(body, user) } };
    });
  }

  @TsRestHandler(contract.iam.updateRole)
  updateRole(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.updateRole, async ({ params, body }) => {
      assertPermissions(user, "iam.role.manage");
      return {
        status: 200,
        body: { role: await this.roles.update(params.id, body, user) },
      };
    });
  }

  @TsRestHandler(contract.iam.cloneRole)
  cloneRole(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.cloneRole, async ({ params, body }) => {
      assertPermissions(user, "iam.role.manage");
      return {
        status: 201,
        body: { role: await this.roles.clone(params.id, body, user) },
      };
    });
  }

  @TsRestHandler(contract.iam.deleteRole)
  deleteRole(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.deleteRole, async ({ params, body }) => {
      assertPermissions(user, "iam.role.manage");
      await this.roles.delete(params.id, body.super_admin_password, user);
      return { status: 204, body: undefined };
    });
  }

  @TsRestHandler(contract.iam.listPermissions)
  listPermissions(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.listPermissions, async () => {
      assertPermissions(user, "iam.role.manage");
      return { status: 200, body: await this.permissions.listCatalog() };
    });
  }

  @TsRestHandler(contract.iam.createRoleTemplate)
  createRoleTemplate(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.createRoleTemplate, async ({ body }) => {
      assertPermissions(user, "iam.role.manage");
      return {
        status: 201,
        body: { template: await this.permissions.createTemplate(body, user) },
      };
    });
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  @TsRestHandler(contract.iam.listUsers)
  listUsers(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.listUsers, async ({ query }) => {
      assertPermissions(user, "iam.user.manage");
      const page = await this.users.list(
        query.limit,
        query.cursor,
        query["filter[status]"],
      );
      return { status: 200, body: page };
    });
  }

  @TsRestHandler(contract.iam.createUser)
  createUser(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.createUser, async ({ body }) => {
      assertPermissions(user, "iam.user.manage");
      return { status: 201, body: { user: await this.users.create(body, user) } };
    });
  }

  @TsRestHandler(contract.iam.setUserRoles)
  setUserRoles(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.setUserRoles, async ({ params, body }) => {
      assertPermissions(user, "iam.user.manage");
      return {
        status: 200,
        body: { user: await this.users.setRoles(params.id, body, user) },
      };
    });
  }

  @TsRestHandler(contract.iam.forceLogout)
  forceLogout(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.forceLogout, async ({ params }) => {
      assertPermissions(user, "iam.user.force_logout");
      await this.users.forceLogout(params.id, user);
      return { status: 204, body: undefined };
    });
  }

  @TsRestHandler(contract.iam.setUserStatus)
  setUserStatus(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.setUserStatus, async ({ params, body }) => {
      assertPermissions(user, "iam.user.manage");
      return {
        status: 200,
        body: { user: await this.users.setStatus(params.id, body.status, user) },
      };
    });
  }

  // ── Import & audit ──────────────────────────────────────────────────────────

  @TsRestHandler(contract.iam.import)
  @UseInterceptors(FileInterceptor("file"))
  import(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedExcel | undefined,
  ) {
    return tsRestHandler(contract.iam.import, async () => {
      assertPermissions(user, "iam.role.manage");
      if (!file) throw new ValidationError("An Excel file is required");
      return { status: 200, body: await this.imports.import(file.buffer, user) };
    });
  }

  @TsRestHandler(contract.iam.listAudit)
  listAudit(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.listAudit, async ({ query }) => {
      assertPermissions(user, "iam.audit.view");
      const page = await this.audit.list({
        limit: query.limit,
        cursor: query.cursor,
        entity_type: query.entity_type,
        entity_id: query.entity_id,
        actor: query.actor,
        from: query.from,
        to: query.to,
      });
      return { status: 200, body: page };
    });
  }
}
