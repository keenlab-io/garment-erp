## MODIFIED Requirements

### Requirement: JWT-authenticated websocket handshake
The realtime gateway SHALL authenticate every Socket.IO connection during the handshake
by verifying a JWT taken from the handshake `auth.token` field or from a bearer
`Authorization` header, MUST reject the connection when the token is missing, invalid,
or expired, and SHALL bind the connection to its tenant by storing the verified `tid`
claim on the socket (`client.data.tenantId`) alongside the user and session ids. The
tenant binding is immutable for the life of the socket.

#### Scenario: Valid token connects and binds the tenant
- **WHEN** a client opens a websocket connection presenting a valid JWT for tenant A
- **THEN** the handshake succeeds and the connection is associated with the authenticated user and tenant A

#### Scenario: Missing or invalid token is rejected
- **WHEN** a client attempts to connect with no token, a malformed token, or an expired token
- **THEN** the gateway rejects the handshake and the connection is not established

### Requirement: Room membership for authenticated clients
The gateway SHALL allow connected clients to join named rooms of the tenant-prefixed
forms `t:{tid}:wo:{id}` and `t:{tid}:timeline`. Only authenticated connections MUST be
permitted to join rooms, and a join request MUST be rejected when the room's `tid`
segment differs from the socket's bound tenant — a client chooses its sub-room, never
its tenant.

#### Scenario: Authenticated client joins its own tenant's room
- **WHEN** a socket bound to tenant A requests to join room `t:{A}:wo:123`
- **THEN** the client is added to that room and subsequently receives events emitted to it

#### Scenario: Cross-tenant join is rejected
- **WHEN** a socket bound to tenant B requests to join `t:{A}:wo:123` or `t:{A}:timeline`
- **THEN** the join is refused with `{ ok: false }` and the socket receives none of that room's broadcasts

#### Scenario: Unauthenticated socket cannot join
- **WHEN** a socket that failed or bypassed handshake authentication attempts to join a room
- **THEN** the join is refused and the socket receives no room broadcasts

### Requirement: Room-scoped event broadcasting
The gateway SHALL expose a server-side operation to emit a named event with a payload to
all members of a given room, and clients outside that room MUST NOT receive the event.
Server-side emitters SHALL construct room names through the `tenantRoom(tenantId,
suffix)` helper so the tenant prefix cannot be silently omitted; the emitting code
derives the tenant from the originating event's context, never from client input.

#### Scenario: Broadcast reaches room members only
- **WHEN** the server emits an event to room `t:{A}:wo:123` while clients A (in the room) and B (not in the room) are connected
- **THEN** client A receives the event and client B does not

#### Scenario: Timeline broadcasts stay inside the tenant
- **WHEN** the server emits a timeline update for tenant A via `tenantRoom(A, "timeline")`
- **THEN** every tenant-A client joined to `t:{A}:timeline` receives it and no tenant-B client does
