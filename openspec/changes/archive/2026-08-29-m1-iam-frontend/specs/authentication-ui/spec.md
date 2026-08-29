## ADDED Requirements

### Requirement: Login and token lifecycle
The web app SHALL provide a `/login` screen that authenticates against the `iam` contract,
stores the access token, attaches it to every API request via the typed client, and establishes
the session context (`AuthUser` with identity, super-admin flag, and permission codes) that the
permission-aware layer consumes. This replaces the M0 placeholder login.

#### Scenario: Successful login establishes a permitted session
- **WHEN** a user submits valid credentials on `/login`
- **THEN** the token is stored and attached to subsequent API requests
- **AND** the sidebar renders only the modules the user's permissions allow

#### Scenario: Invalid credentials show an inline error
- **WHEN** a user submits invalid credentials
- **THEN** an inline error states what happened and how to fix it, and no session is created

### Requirement: Re-authentication on permission change
When the API rejects a request because the user's `permissions_version` is stale (or the token
is expired), the app SHALL clear the session and route to `/login` with a notice that access
changed, rather than leaving the user in a broken state.

#### Scenario: Stale permission version forces re-login
- **WHEN** an API response indicates the session's `permissions_version` is stale
- **THEN** the session is cleared and the user is routed to `/login` with an explanatory notice
