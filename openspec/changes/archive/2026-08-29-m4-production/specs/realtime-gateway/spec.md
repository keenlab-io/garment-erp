## ADDED Requirements

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
