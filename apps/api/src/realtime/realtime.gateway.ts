import { Logger } from "@nestjs/common";
import {
  type OnGatewayConnection,
  MessageBody,
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { TokenService } from "../auth/token.service.js";
import { isTenantId } from "../tenancy/tenant-context.js";

/** The sub-rooms a client may subscribe to: the `timeline`, or one work order `wo:{uuid}`. */
const SUB_ROOM_PATTERN = /^(timeline|wo:[0-9a-fA-F]{8}-[0-9a-fA-F-]{27})$/;

/** A tenant-scoped room name, `t:{tid}:{suffix}` (M7 design D12). */
const TENANT_ROOM_PATTERN = /^t:([^:]+):(.+)$/;

/**
 * The tenant-scoped room for `suffix` (`wo:{id}`, `timeline`). Every server-side emitter builds
 * its room through this, so the tenant prefix cannot be forgotten silently.
 */
export function tenantRoom(tenantId: string, suffix: string): string {
  if (!isTenantId(tenantId)) {
    throw new Error(`Refusing to build a room for a malformed tenant id "${tenantId}"`);
  }
  return `t:${tenantId}:${suffix}`;
}

/** A parsed room request: the tenant it names (if any) and the sub-room. */
export interface ParsedRoom {
  tenantId: string | null;
  suffix: string;
}

/**
 * Parse a client room request. `t:{tid}:(timeline|wo:{uuid})` names its tenant explicitly; a
 * bare `timeline` / `wo:{uuid}` (the pre-M7 shape the web client still sends) names none and is
 * scoped to the socket's own tenant. Anything else is `null` (rejected).
 */
export function parseRoom(room: unknown): ParsedRoom | null {
  if (typeof room !== "string") return null;
  const scoped = TENANT_ROOM_PATTERN.exec(room);
  if (scoped) {
    const [, tenantId, suffix] = scoped as unknown as [string, string, string];
    return isTenantId(tenantId) && SUB_ROOM_PATTERN.test(suffix) ? { tenantId, suffix } : null;
  }
  return SUB_ROOM_PATTERN.test(room) ? { tenantId: null, suffix: room } : null;
}

/**
 * Socket.IO gateway. Authenticates each connection by verifying the access token
 * from the handshake (`auth.token` or a bearer `Authorization` header) and drops
 * unauthenticated clients. `joinRoom`/`emitToRoom` back the M4 rooms (`wo:{id}`,
 * `timeline`).
 *
 * Tenancy (M7 design D12): the handshake binds the socket to the token's `tid`, and every room
 * is `t:{tid}:…`. A client picks only its sub-room — never its tenant: a join naming another
 * tenant is rejected, and a bare sub-room is joined under the socket's own tenant.
 */
@WebSocketGateway({ cors: true })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(private readonly tokens: TokenService) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = extractToken(client);
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const claims = await this.tokens.verifyAccess(token);
      if (!isTenantId(claims.tid)) throw new Error("token carries no tenant");
      client.data.userId = claims.sub;
      client.data.sessionId = claims.sid;
      client.data.tenantId = claims.tid;
    } catch {
      this.logger.warn(`rejected socket ${client.id}: invalid token`);
      client.disconnect();
    }
  }

  joinRoom(client: Socket, room: string): void {
    void client.join(room);
  }

  /**
   * Client room subscription (M4 design D6). An authenticated socket (the handshake already
   * gated it) joins a validated `wo:{id}` or `timeline` room of its own tenant to receive the
   * production broadcasts. Returns `{ ok }` so the client can `emitWithAck`; an invalid room,
   * or one naming a different tenant, is rejected rather than silently joined.
   */
  @SubscribeMessage("join")
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() room: unknown,
  ): { ok: boolean; room?: string } {
    const own = client.data.tenantId as string | undefined;
    const parsed = parseRoom(room);
    if (!parsed || !own || (parsed.tenantId !== null && parsed.tenantId !== own)) {
      this.logger.warn(`socket ${client.id} requested invalid room ${String(room)}`);
      return { ok: false };
    }
    const scoped = tenantRoom(own, parsed.suffix);
    this.joinRoom(client, scoped);
    return { ok: true, room: scoped };
  }

  /** Broadcast to a room. Callers pass a `tenantRoom(...)` name. */
  emitToRoom(room: string, event: string, payload: unknown): void {
    this.server.to(room).emit(event, payload);
  }
}

/** Pull the access token from the Socket.IO handshake (`auth.token` or bearer). */
function extractToken(client: Socket): string | null {
  const auth = client.handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === "string" && auth.token) return auth.token;
  const header = client.handshake.headers.authorization;
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7);
  }
  return null;
}
