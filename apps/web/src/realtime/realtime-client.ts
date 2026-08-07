import { io, type Socket } from "socket.io-client";
import { getAccessToken } from "../api/token-store.js";

/** The rooms `RealtimeGateway` accepts (`apps/api/src/realtime/realtime.gateway.ts` `ROOM_PATTERN`). */
export type RealtimeRoom = "timeline" | `wo:${string}`;

/**
 * Socket.IO client for the M4 production realtime rooms (design FD9). Authenticates via the
 * handshake `auth.token` — read fresh on every (re)connect attempt, since `auth` is a function —
 * matching `RealtimeGateway.extractToken`'s `auth.token`/bearer-header check. Connects same-origin
 * (dev: proxied by `vite.config.ts`'s `/socket.io` entry) so `apps/web` never hardcodes an API host.
 *
 * Rooms joined via `joinRoom` are remembered and re-emitted as `join` on every `connect` event —
 * the first one and every reconnect — so a caller only calls `joinRoom` once per room and
 * reconnection (network blip, token refresh) is transparent (design "Risks/Trade-offs").
 */
export class RealtimeClient {
  private socket: Socket | null = null;
  private readonly rooms = new Set<RealtimeRoom>();

  /** Lazily creates and connects the socket; idempotent. */
  connect(): Socket {
    if (this.socket) return this.socket;
    const socket = io({
      auth: (cb) => cb({ token: getAccessToken() }),
      // WebSocket only — no HTTP long-polling fallback. Socket.IO's default handshake starts
      // on polling and upgrades, which requires every request of that handshake to land on the
      // same api pod. Nothing in the production chain provides sticky sessions (Nginx Proxy
      // Manager → Tailscale → the erp-web Service across 2 nginx pods → the erp-api ClusterIP),
      // so polling would fail intermittently once `erp-api` runs more than one replica.
      // A single long-lived WebSocket connection is pinned to one pod by definition.
      transports: ["websocket"],
    });
    socket.on("connect", () => {
      for (const room of this.rooms) {
        socket.emit("join", room);
      }
    });
    this.socket = socket;
    return socket;
  }

  /** Joins a room now (if connected) and rejoins it on every future reconnect. */
  joinRoom(room: RealtimeRoom): void {
    this.rooms.add(room);
    const socket = this.connect();
    if (socket.connected) {
      socket.emit("join", room);
    }
  }

  /** Stops rejoining a room on reconnect. Does not ask the server to leave the current socket. */
  leaveRoom(room: RealtimeRoom): void {
    this.rooms.delete(room);
  }

  /** Subscribe to a server-emitted event (e.g. `StepStarted`/`StepFinished`/`StepDelayed`). */
  on(event: string, handler: (...args: unknown[]) => void): void {
    this.connect().on(event, handler);
  }

  off(event: string, handler?: (...args: unknown[]) => void): void {
    this.socket?.off(event, handler);
  }

  /** Tears down the connection and forgets every room; the next `joinRoom`/`connect` starts fresh. */
  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.rooms.clear();
  }
}

/** App-wide singleton — one socket per session, shared by every production screen. */
export const realtimeClient = new RealtimeClient();
