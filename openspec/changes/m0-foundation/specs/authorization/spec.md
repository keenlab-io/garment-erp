## ADDED Requirements

### Requirement: Typed permission catalog
The permission catalog in `@erp/contracts` SHALL be the single source of truth for allowed permission codes of the form `module.resource.action`. Authorization APIs (`@Permissions(...)`, `assertPermissions(...)`) MUST accept only codes from the catalog's type, so that referencing an unknown or misspelled code is a TypeScript compile error.

#### Scenario: Known code compiles
- **WHEN** a handler references a permission code that exists in the catalog (e.g. `assertPermissions(user, "sales.invoice.create")`)
- **THEN** the code typechecks and the check is enforced at runtime

#### Scenario: Unknown code fails compilation
- **WHEN** a handler references a permission code that is not in the catalog (e.g. a typo like `"sales.invoce.create"`)
- **THEN** `pnpm typecheck` fails with a type error
- **AND** the mistake cannot reach runtime

### Requirement: Per-endpoint permission enforcement
The system SHALL assert, per protected endpoint, that the current authenticated user holds the required permission code. A request by a user who lacks the required permission MUST be rejected with 403 FORBIDDEN using the uniform error envelope.

#### Scenario: User with the permission is allowed
- **WHEN** an authenticated user whose resolved permission set contains the endpoint's required code makes a request
- **THEN** the permission check passes and the handler executes

#### Scenario: User without the permission is rejected
- **WHEN** an authenticated non-super-admin user whose resolved permission set does not contain the required code makes a request
- **THEN** the request is rejected with 403 and error code FORBIDDEN

### Requirement: Super-admin bypass
A user whose `isSuperAdmin` flag is true SHALL bypass permission checks: both the `PermissionsGuard` and `assertPermissions` MUST allow super-admin users regardless of their resolved permission set.

#### Scenario: Super-admin passes without permissions
- **WHEN** a super-admin user requests an endpoint requiring a permission code that is not in their resolved permission set
- **THEN** the request is allowed

#### Scenario: Super-admin still requires authentication
- **WHEN** a request with no valid token targets a protected endpoint
- **THEN** the request is rejected with 401 regardless of any super-admin bypass

### Requirement: Pluggable permission resolver seam
Permission resolution SHALL go through a `PERMISSION_RESOLVER` injection token (a seam in `auth.tokens.ts`). M0's default resolver MUST return an empty permission set, so that in M0 only super-admin users pass permission checks. A later module MUST be able to rebind `PERMISSION_RESOLVER` to a role-to-permission union without modifying any M0 code.

#### Scenario: Default resolver returns empty set
- **WHEN** the API runs with M0's default `PERMISSION_RESOLVER` binding and a non-super-admin user is authenticated
- **THEN** the user's resolved permission set is empty
- **AND** every permission-guarded request by that user is rejected with 403 FORBIDDEN

#### Scenario: Resolver is rebindable without M0 changes
- **WHEN** a later module provides its own `PERMISSION_RESOLVER` implementation (e.g. a role-to-permission union)
- **THEN** the guard and `assertPermissions` use the new resolver's permission sets
- **AND** no M0 guard, seam, or handler code requires modification

### Requirement: In-handler authorization for ts-rest endpoints
Because ts-rest wraps handler methods, method-level guard metadata is not visible to the guards' `Reflector` — only class-level metadata is — and one `@TsRestHandler` method can serve multiple logical endpoints. Therefore ts-rest endpoints MUST perform authorization inside the handler by calling `assertPermissions(user, "module.resource.action")`, and the `@Public()` decorator MUST be applied at the class level on ts-rest controllers. The `@Permissions()` decorator, enforced by `PermissionsGuard`, SHALL remain usable on plain (non-ts-rest) controllers.

#### Scenario: ts-rest endpoint authorizes in the handler
- **WHEN** a ts-rest handler serving a protected endpoint calls `assertPermissions(user, code)` and the user lacks the code (and is not a super-admin)
- **THEN** the call throws a ForbiddenError and the request is rejected with 403 FORBIDDEN

#### Scenario: Class-level @Public on a ts-rest controller
- **WHEN** a ts-rest controller class is decorated with `@Public()` at the class level
- **THEN** all endpoints served by that class are reachable without authentication

#### Scenario: Method-level metadata on ts-rest handlers is not relied upon
- **WHEN** an endpoint is implemented via a `@TsRestHandler` method
- **THEN** its authorization is enforced by an in-handler `assertPermissions` call rather than method-level `@Permissions()` metadata

#### Scenario: @Permissions on a plain controller
- **WHEN** a plain (non-ts-rest) controller method is decorated with `@Permissions("module.resource.action")` and a non-super-admin user without that permission makes a request
- **THEN** `PermissionsGuard` rejects the request with 403 FORBIDDEN
