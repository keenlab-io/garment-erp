# Realtime Gateway

## Purpose
A JWT-authenticated Socket.IO gateway with per-client room membership and room-scoped event broadcasting.

## Requirements

### Requirement: JWT-authenticated websocket handshake
The realtime gateway SHALL authenticate every Socket.io connection during the handshake by verifying a JWT taken from the handshake `auth.token` field or from a bearer `Authorization` header, and MUST reject the connection when the token is missing, invalid, or expired.

#### Scenario: Valid token connects
- **WHEN** a client opens a websocket connection presenting a valid JWT in `auth.token` or as a bearer header
- **THEN** the handshake succeeds and the connection is associated with the authenticated user

#### Scenario: Missing or invalid token is rejected
- **WHEN** a client attempts to connect with no token, a malformed token, or an expired token
- **THEN** the gateway rejects the handshake and the connection is not established

### Requirement: Room membership for authenticated clients
The gateway SHALL allow connected clients to join named rooms (including work-order rooms of the form `wo:{id}` and the `timeline` room), and only authenticated connections MUST be permitted to join rooms.

#### Scenario: Authenticated client joins a room
- **WHEN** an authenticated client requests to join room `wo:123`
- **THEN** the client is added to that room and subsequently receives events emitted to it

#### Scenario: Unauthenticated socket cannot join
- **WHEN** a socket that failed or bypassed handshake authentication attempts to join a room
- **THEN** the join is refused and the socket receives no room broadcasts

### Requirement: Room-scoped event broadcasting
The gateway SHALL expose a server-side operation to emit a named event with a payload to all members of a given room, and clients outside that room MUST NOT receive the event.

#### Scenario: Broadcast reaches room members only
- **WHEN** the server emits an event to room `wo:123` while clients A (in the room) and B (not in the room) are connected
- **THEN** client A receives the event and client B does not

#### Scenario: Timeline room broadcast
- **WHEN** the server emits a timeline update event to the `timeline` room
- **THEN** every authenticated client that has joined `timeline` receives the event

### Requirement: Authenticated clients can join rooms
The realtime gateway SHALL provide a client-invocable message that lets an authenticated
socket **join a named room** (e.g. `wo:{id}` or `timeline`), so that server-side
`emitToRoom` broadcasts reach subscribed clients. The join MUST be available only to a socket
that passed the JWT handshake; a request to join from an unauthenticated socket MUST NOT
succeed. (M0 shipped only server-side `emitToRoom`/`joinRoom(client, room)` with no
client-driven join path; this adds it.)

#### Scenario: Authenticated socket joins a work-order room
- **WHEN** an authenticated client sends the join message for room `wo:{id}`
- **THEN** the socket joins that room and subsequently receives events emitted to it

#### Scenario: Joined client receives room broadcasts
- **WHEN** the server emits an event to a room a client has joined
- **THEN** that client receives the event payload

#### Scenario: Unauthenticated socket cannot join
- **WHEN** a socket that failed the JWT handshake attempts to join a room
- **THEN** it does not join (the connection was already rejected at handshake)
