import { Logger } from "@nestjs/common";
import {
  type OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { TokenService } from "../auth/token.service.js";

/**
 * Socket.IO gateway. Authenticates each connection by verifying the access token
 * from the handshake (`auth.token` or a bearer `Authorization` header) and drops
 * unauthenticated clients. `joinRoom`/`emitToRoom` back the M4 rooms (`wo:{id}`,
 * `timeline`).
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
      client.data.userId = claims.sub;
      client.data.sessionId = claims.sid;
    } catch {
      this.logger.warn(`rejected socket ${client.id}: invalid token`);
      client.disconnect();
    }
  }

  joinRoom(client: Socket, room: string): void {
    void client.join(room);
  }

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
