import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AuditQuery, ImportResult, UsersQuery } from "@erp/contracts";
import { api } from "../api/client.js";

/**
 * Query keys for the `iam` domain (M1 §2.3) — one place so a mutation's invalidation and a query's
 * key can never drift apart.
 */
export const iamKeys = {
  all: ["iam"] as const,
  // Prefix shared by every "users" query (list or detail) — invalidate this to catch them all.
  usersAll: () => [...iamKeys.all, "users"] as const,
  users: (query: Partial<UsersQuery> = {}) => [...iamKeys.usersAll(), query] as const,
  user: (id: string) => [...iamKeys.usersAll(), id] as const,
  rolesAll: () => [...iamKeys.all, "roles"] as const,
  roles: () => [...iamKeys.rolesAll()] as const,
  role: (id: string) => [...iamKeys.rolesAll(), id] as const,
  permissions: () => [...iamKeys.all, "permissions"] as const,
  roleTemplates: () => [...iamKeys.all, "role-templates"] as const,
  audit: (query: Partial<AuditQuery> = {}) => [...iamKeys.all, "audit", query] as const,
};

// ── Queries ───────────────────────────────────────────────────────────────────

export function useUsersQuery(query: Partial<UsersQuery> = {}) {
  return api.iam.listUsers.useQuery(iamKeys.users(query), { query });
}

export function useUserQuery(id: string) {
  return api.iam.getUser.useQuery(iamKeys.user(id), { params: { id } });
}

export function useRolesQuery() {
  return api.iam.listRoles.useQuery(iamKeys.roles());
}

export function useRoleQuery(id: string) {
  return api.iam.getRole.useQuery(iamKeys.role(id), { params: { id } });
}

export function usePermissionsCatalogQuery() {
  return api.iam.listPermissions.useQuery(iamKeys.permissions());
}

export function useRoleTemplatesQuery() {
  return api.iam.listRoleTemplates.useQuery(iamKeys.roleTemplates());
}

export function useAuditQuery(query: Partial<AuditQuery> = {}) {
  return api.iam.listAudit.useQuery(iamKeys.audit(query), { query });
}

// ── Mutations ─────────────────────────────────────────────────────────────────
// Each invalidates the query keys its write affects — screens (M1 §4) never invalidate by hand.

export function useCreateUserMutation() {
  const queryClient = useQueryClient();
  return api.iam.createUser.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: iamKeys.usersAll() });
    },
  });
}

export function useSetUserRolesMutation() {
  const queryClient = useQueryClient();
  return api.iam.setUserRoles.useMutation({
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: iamKeys.usersAll() });
      void queryClient.invalidateQueries({ queryKey: iamKeys.user(variables.params.id) });
    },
  });
}

export function useSetUserStatusMutation() {
  const queryClient = useQueryClient();
  return api.iam.setUserStatus.useMutation({
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: iamKeys.usersAll() });
      void queryClient.invalidateQueries({ queryKey: iamKeys.user(variables.params.id) });
    },
  });
}

/**
 * Session revoke (M1 §3.4 SessionList row action). The contract has no session-list endpoint yet —
 * `forceLogout` revokes every session for a user, so it's the one "sessions" mutation to wire.
 */
export function useForceLogoutMutation() {
  const queryClient = useQueryClient();
  return api.iam.forceLogout.useMutation({
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: iamKeys.user(variables.params.id) });
    },
  });
}

export function useCreateRoleMutation() {
  const queryClient = useQueryClient();
  return api.iam.createRole.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: iamKeys.rolesAll() });
    },
  });
}

export function useUpdateRoleMutation() {
  const queryClient = useQueryClient();
  return api.iam.updateRole.useMutation({
    onSuccess: () => {
      // Bumps affected users' permissions_version (contract summary) — their cached rows go stale too.
      void queryClient.invalidateQueries({ queryKey: iamKeys.rolesAll() });
      void queryClient.invalidateQueries({ queryKey: iamKeys.usersAll() });
    },
  });
}

export function useCloneRoleMutation() {
  const queryClient = useQueryClient();
  return api.iam.cloneRole.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: iamKeys.rolesAll() });
    },
  });
}

export function useDeleteRoleMutation() {
  const queryClient = useQueryClient();
  return api.iam.deleteRole.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: iamKeys.rolesAll() });
    },
  });
}

export function useCreateRoleTemplateMutation() {
  const queryClient = useQueryClient();
  return api.iam.createRoleTemplate.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: iamKeys.roleTemplates() });
    },
  });
}

/**
 * Permission import (M1 §4.5, MD5). The contract has one endpoint that validates and applies the
 * whole file atomically — there is no separate dry-run — so `mutate` both validates and imports in
 * the same round trip; the screen renders its `ImportResult` as the validation review. Throws on a
 * non-200 response (all-or-nothing on an unknown permission code) so `isError`/`onError` see it,
 * matching `useLoginMutation`'s pattern for a contract that returns errors rather than throwing.
 */
export function useImportMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const response = await api.iam.import.mutation({ body: { file } });
      if (response.status !== 200) throw response;
      return response.body;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: iamKeys.rolesAll() });
    },
  });
}
