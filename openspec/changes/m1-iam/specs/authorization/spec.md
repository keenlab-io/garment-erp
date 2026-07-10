## ADDED Requirements

### Requirement: Role-based permission resolver rebinds the M0 seam
M1 SHALL provide a `RolePermissionResolver` implementing the M0 `PermissionResolver`
interface and bind it to the `PERMISSION_RESOLVER` injection token in `IamModule`,
overriding M0's empty-set default. Its `resolve(userId)` MUST return the union of
`permission.code` values across the user's assigned roles
(`user_role ⋈ role_permission ⋈ permission`), read through `currentExecutor` so it honors
any active transaction. This rebind MUST be the only change required for the global
`JwtGuard` and `assertPermissions` to enforce real permissions — **no M0 guard, seam, or
handler code is modified**.

#### Scenario: Effective permissions are the union across roles
- **WHEN** a non-super-admin user is assigned two roles whose permission sets differ
- **THEN** the resolver returns the union of both roles' permission codes
- **AND** a request requiring any code in that union is allowed

#### Scenario: A user with no roles has no permissions
- **WHEN** an authenticated non-super-admin user has no assigned roles
- **THEN** the resolver returns an empty permission set
- **AND** every permission-guarded request by that user is rejected with 403 FORBIDDEN

#### Scenario: Super-admin still bypasses resolution
- **WHEN** a super-admin user makes a permission-guarded request
- **THEN** the request is allowed regardless of the resolver's output

#### Scenario: Rebind requires no M0 code change
- **WHEN** `IamModule` provides `RolePermissionResolver` for `PERMISSION_RESOLVER`
- **THEN** the M0 `AuthModule`, `JwtGuard`, `PermissionsGuard`, and `assertPermissions` are used unmodified
