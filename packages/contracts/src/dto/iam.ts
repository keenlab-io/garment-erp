import { z } from "zod";
import { initContract } from "@ts-rest/core";
import { PERMISSIONS } from "../permissions/index.js";
import { UserStatus } from "../enums/index.js";
import {
  API_PREFIX,
  paginated,
  paginationQuery,
  uuid,
  withErrors,
} from "./_shared.js";

/**
 * M1 — Access & Identity (IAM) contract (spec §1.7). Router `iamContract` covers
 * authentication, RBAC (roles · permissions · templates), user & session lifecycle,
 * permission import, and the audit-log query. `login`/`refresh` are public; every other
 * endpoint authorizes in-handler via `assertPermissions(user, "iam...")` (see M0 ts-rest note).
 */

const c = initContract();

/** A permission code from the single-source catalog — request bodies validate against it. */
export const permissionCode = z.enum(PERMISSIONS);

/** Account lifecycle status. */
export const userStatus = z.nativeEnum(UserStatus);

// ── Auth ────────────────────────────────────────────────────────────────────

export const LoginRequest = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/** Issued token pair — access + refresh JWT with the access token's lifetime in seconds. */
export const TokenPair = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().int().positive(),
});
export type TokenPair = z.infer<typeof TokenPair>;

export const RefreshRequest = z.object({
  refresh_token: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequest>;

/** The authenticated identity returned by `GET /auth/me`. */
export const AuthUser = z.object({
  id: uuid,
  username: z.string(),
  email: z.string().email(),
  status: userStatus,
  is_super_admin: z.boolean(),
  employee_id: uuid.nullable(),
});
export type AuthUser = z.infer<typeof AuthUser>;

/** A role reference as carried on a user (id + display name only). */
export const RoleRef = z.object({
  id: uuid,
  name: z.string(),
});
export type RoleRef = z.infer<typeof RoleRef>;

/** `GET /auth/me` payload — identity, bound roles, and the effective permission union. */
export const MeResponse = z.object({
  user: AuthUser,
  roles: z.array(RoleRef),
  permissions: z.array(permissionCode),
});
export type MeResponse = z.infer<typeof MeResponse>;

// ── Roles & permissions ──────────────────────────────────────────────────────

/** A role with its full permission set — returned by create/update/clone. */
export const Role = z.object({
  id: uuid,
  name: z.string(),
  description: z.string().nullable(),
  is_system: z.boolean(),
  cloned_from: uuid.nullable(),
  permission_codes: z.array(permissionCode),
});
export type Role = z.infer<typeof Role>;

/** A row in the roles list — counts instead of the full permission set. */
export const RoleSummary = z.object({
  id: uuid,
  name: z.string(),
  permission_count: z.number().int().nonnegative(),
  user_count: z.number().int().nonnegative(),
});
export type RoleSummary = z.infer<typeof RoleSummary>;

export const CreateRoleRequest = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permission_codes: z.array(permissionCode),
});
export type CreateRoleRequest = z.infer<typeof CreateRoleRequest>;

/** All fields optional — a partial update; provided `permission_codes` replaces the set. */
export const UpdateRoleRequest = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  permission_codes: z.array(permissionCode).optional(),
});
export type UpdateRoleRequest = z.infer<typeof UpdateRoleRequest>;

export const CloneRoleRequest = z.object({
  name: z.string().min(1),
});
export type CloneRoleRequest = z.infer<typeof CloneRoleRequest>;

/** Deleting a role requires Super-Admin re-authentication (spec §1.5). */
export const DeleteRoleRequest = z.object({
  super_admin_password: z.string().min(1),
});
export type DeleteRoleRequest = z.infer<typeof DeleteRoleRequest>;

/** A catalog entry — the known permission codes the UI gates against. */
export const PermissionEntry = z.object({
  code: permissionCode,
});
export type PermissionEntry = z.infer<typeof PermissionEntry>;

export const CreateRoleTemplateRequest = z.object({
  name: z.string().min(1),
  permission_codes: z.array(permissionCode),
});
export type CreateRoleTemplateRequest = z.infer<typeof CreateRoleTemplateRequest>;

export const RoleTemplate = z.object({
  id: uuid,
  name: z.string(),
  permission_codes: z.array(permissionCode),
});
export type RoleTemplate = z.infer<typeof RoleTemplate>;

// ── Users ─────────────────────────────────────────────────────────────────────

/** A row in the users list. */
export const User = z.object({
  id: uuid,
  username: z.string(),
  email: z.string().email(),
  status: userStatus,
  is_super_admin: z.boolean(),
  employee_id: uuid.nullable(),
  roles: z.array(RoleRef),
  last_login_at: z.string().datetime().nullable(),
});
export type User = z.infer<typeof User>;

export const CreateUserRequest = z.object({
  employee_id: uuid.optional(),
  username: z.string().min(1),
  email: z.string().email(),
  role_ids: z.array(uuid),
  temp_password: z.string().min(1),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequest>;

export const SetUserRolesRequest = z.object({
  role_ids: z.array(uuid),
});
export type SetUserRolesRequest = z.infer<typeof SetUserRolesRequest>;

export const SetUserStatusRequest = z.object({
  status: userStatus,
});
export type SetUserStatusRequest = z.infer<typeof SetUserStatusRequest>;

/** Users list query — cursor pagination plus the optional `filter[status]` facet. */
export const UsersQuery = paginationQuery.extend({
  "filter[status]": userStatus.optional(),
});
export type UsersQuery = z.infer<typeof UsersQuery>;

// ── Import & audit ──────────────────────────────────────────────────────────

/** A row the import skipped, with the reason it was rejected. */
export const ImportSkip = z.object({
  row: z.number().int().nonnegative(),
  reason: z.string(),
});
export type ImportSkip = z.infer<typeof ImportSkip>;

export const ImportResult = z.object({
  imported: z.number().int().nonnegative(),
  skipped: z.array(ImportSkip),
});
export type ImportResult = z.infer<typeof ImportResult>;

/** An append-only audit-log entry. */
export const AuditEntry = z.object({
  id: uuid,
  at: z.string().datetime(),
  actor_user_id: uuid.nullable(),
  actor_role: z.string().nullable(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: uuid.nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  reason: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

/** Audit query — cursor pagination plus the spec's entity/actor/time filters. */
export const AuditQuery = paginationQuery.extend({
  entity_type: z.string().optional(),
  entity_id: uuid.optional(),
  actor: uuid.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type AuditQuery = z.infer<typeof AuditQuery>;

// ── Router ────────────────────────────────────────────────────────────────────

export const iamContract = c.router(
  {
    // Auth (login/refresh are @Public at the controller class level)
    login: {
      method: "POST",
      path: "/auth/login",
      body: LoginRequest,
      responses: withErrors({ 200: TokenPair }),
      summary: "Authenticate and issue a token pair",
    },
    refresh: {
      method: "POST",
      path: "/auth/refresh",
      body: RefreshRequest,
      responses: withErrors({ 200: TokenPair }),
      summary: "Exchange a refresh token for a fresh token pair",
    },
    logout: {
      method: "POST",
      path: "/auth/logout",
      body: z.void(),
      responses: withErrors({ 204: z.void() }),
      summary: "Revoke the current session",
    },
    me: {
      method: "GET",
      path: "/auth/me",
      responses: withErrors({ 200: MeResponse }),
      summary: "Current identity, roles, and effective permissions",
    },

    // Roles & permissions (iam.role.manage)
    listRoles: {
      method: "GET",
      path: "/roles",
      responses: withErrors({ 200: z.array(RoleSummary) }),
      summary: "List roles with permission and user counts",
    },
    createRole: {
      method: "POST",
      path: "/roles",
      body: CreateRoleRequest,
      responses: withErrors({ 201: z.object({ role: Role }) }),
      summary: "Create a role",
    },
    updateRole: {
      method: "PUT",
      path: "/roles/:id",
      pathParams: z.object({ id: uuid }),
      body: UpdateRoleRequest,
      responses: withErrors({ 200: z.object({ role: Role }) }),
      summary: "Update a role (bumps affected users' permissions_version)",
    },
    cloneRole: {
      method: "POST",
      path: "/roles/:id/clone",
      pathParams: z.object({ id: uuid }),
      body: CloneRoleRequest,
      responses: withErrors({ 201: z.object({ role: Role }) }),
      summary: "Deep-copy a role's permissions into a new role",
    },
    deleteRole: {
      method: "DELETE",
      path: "/roles/:id",
      pathParams: z.object({ id: uuid }),
      body: DeleteRoleRequest,
      responses: withErrors({ 204: z.void() }),
      summary: "Delete a role (Super-Admin re-auth; 409 if users still bound)",
    },
    listPermissions: {
      method: "GET",
      path: "/permissions",
      responses: withErrors({ 200: z.array(PermissionEntry) }),
      summary: "The permission catalog",
    },
    createRoleTemplate: {
      method: "POST",
      path: "/role-templates",
      body: CreateRoleTemplateRequest,
      responses: withErrors({ 201: z.object({ template: RoleTemplate }) }),
      summary: "Create a reusable role template",
    },

    // Users (iam.user.manage)
    listUsers: {
      method: "GET",
      path: "/users",
      query: UsersQuery,
      responses: withErrors({ 200: paginated(User) }),
      summary: "List users (paginated, optional status filter)",
    },
    createUser: {
      method: "POST",
      path: "/users",
      body: CreateUserRequest,
      responses: withErrors({ 201: z.object({ user: User }) }),
      summary: "Create a user with a temporary password",
    },
    setUserRoles: {
      method: "PUT",
      path: "/users/:id/roles",
      pathParams: z.object({ id: uuid }),
      body: SetUserRolesRequest,
      responses: withErrors({ 200: z.object({ user: User }) }),
      summary: "Replace a user's roles (bumps permissions_version)",
    },
    forceLogout: {
      method: "POST",
      path: "/users/:id/force-logout",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 204: z.void() }),
      summary: "Revoke all sessions and bump permissions_version (iam.user.force_logout)",
    },
    setUserStatus: {
      method: "POST",
      path: "/users/:id/status",
      pathParams: z.object({ id: uuid }),
      body: SetUserStatusRequest,
      responses: withErrors({ 200: z.object({ user: User }) }),
      summary: "Change a user's account status",
    },

    // Import & audit
    import: {
      method: "POST",
      path: "/iam/import",
      contentType: "multipart/form-data",
      body: z.object({ file: z.any() }),
      responses: withErrors({ 200: ImportResult }),
      summary: "Import roles/permissions from an Excel file (iam.role.manage)",
    },
    listAudit: {
      method: "GET",
      path: "/audit",
      query: AuditQuery,
      responses: withErrors({ 200: paginated(AuditEntry) }),
      summary: "Query the audit log (iam.audit.view)",
    },
  },
  { pathPrefix: API_PREFIX },
);
