import { Module } from "@nestjs/common";
import { PERMISSION_RESOLVER } from "../auth/auth.tokens.js";
import { AuditQueryService } from "./audit-query.service.js";
import { AuthService } from "./auth.service.js";
import { IamAuthController } from "./iam-auth.controller.js";
import { IamController } from "./iam.controller.js";
import { ImportService } from "./import.service.js";
import { PermissionService } from "./permission.service.js";
import { RolePermissionResolver } from "./role-permission.resolver.js";
import { RoleService } from "./role.service.js";
import { UserService } from "./user.service.js";

/**
 * M1 IAM module. Declares the auth/role/user/permission/import/audit services and
 * the two ts-rest controllers, and — the one wiring change that turns M0's mechanism
 * into RBAC — rebinds `PERMISSION_RESOLVER` to `RolePermissionResolver`, overriding
 * the `@Global` M0 empty-set default so the global `JwtGuard` enforces real
 * permissions (design D1). Everything else it needs (DB, UnitOfWork, EventBus,
 * PasswordService, TokenService, ConfigService) comes from the global M0 modules.
 */
@Module({
  controllers: [IamAuthController, IamController],
  providers: [
    AuthService,
    RoleService,
    UserService,
    PermissionService,
    ImportService,
    AuditQueryService,
    RolePermissionResolver,
    { provide: PERMISSION_RESOLVER, useExisting: RolePermissionResolver },
  ],
  exports: [PERMISSION_RESOLVER],
})
export class IamModule {}
