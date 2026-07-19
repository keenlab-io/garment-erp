import { afterEach, describe, expect, it, vi } from "vitest";
import { setTokens, clearTokens } from "../api/token-store";

const { fakeSocket, ioMock } = vi.hoisted(() => {
  type Handler = (...args: never[]) => void;
  const listeners = new Map<string, Set<Handler>>();
  const fakeSocket = {
    connected: false,
    emit: vi.fn(),
    on: vi.fn((event: string, handler: Handler) => {
      const set = listeners.get(event) ?? new Set<Handler>();
      set.add(handler);
      listeners.set(event, set);
    }),
    off: vi.fn((event: string, handler?: Handler) => {
      if (!handler) {
        listeners.delete(event);
        return;
      }
      listeners.get(event)?.delete(handler);
    }),
    disconnect: vi.fn(),
    // Test helpers (not part of the real Socket surface).
    __trigger: (event: string, ...args: never[]) => {
      for (const handler of listeners.get(event) ?? []) handler(...args);
    },
    __resetListeners: () => listeners.clear(),
  };
  const ioMock = vi.fn((_options?: { auth: (cb: (v: unknown) => void) => void }) => fakeSocket);
  return { fakeSocket, ioMock };
});

vi.mock("socket.io-client", () => ({ io: ioMock }));

describe("RealtimeClient", () => {
  afterEach(async () => {
    ioMock.mockClear();
    fakeSocket.emit.mockClear();
    fakeSocket.on.mockClear();
    fakeSocket.off.mockClear();
    fakeSocket.disconnect.mockClear();
    fakeSocket.connected = false;
    fakeSocket.__resetListeners();
    clearTokens();
    vi.resetModules();
  });

  it("connects once and reads the access token fresh on each handshake", async () => {
    setTokens({ accessToken: "tok-1", refreshToken: "r" });
    const { RealtimeClient } = await import("./realtime-client");
    const client = new RealtimeClient();

    client.connect();
    client.connect();

    expect(ioMock).toHaveBeenCalledTimes(1);
    const options = ioMock.mock.calls[0]![0]!;
    const cb = vi.fn();
    options.auth(cb);
    expect(cb).toHaveBeenCalledWith({ token: "tok-1" });
  });

  it("joins a room immediately when already connected", async () => {
    const { RealtimeClient } = await import("./realtime-client");
    const client = new RealtimeClient();
    fakeSocket.connected = true;

    client.joinRoom("timeline");

    expect(fakeSocket.emit).toHaveBeenCalledWith("join", "timeline");
  });

  it("defers a joined room until connect, then re-emits it on every reconnect", async () => {
    const { RealtimeClient } = await import("./realtime-client");
    const client = new RealtimeClient();
    fakeSocket.connected = false;

    client.joinRoom("wo:123e4567-e89b-12d3-a456-426614174000");
    expect(fakeSocket.emit).not.toHaveBeenCalled();

    fakeSocket.__trigger("connect");
    expect(fakeSocket.emit).toHaveBeenCalledWith("join", "wo:123e4567-e89b-12d3-a456-426614174000");

    fakeSocket.emit.mockClear();
    fakeSocket.__trigger("connect");
    expect(fakeSocket.emit).toHaveBeenCalledWith("join", "wo:123e4567-e89b-12d3-a456-426614174000");
  });

  it("stops rejoining a room after leaveRoom", async () => {
    const { RealtimeClient } = await import("./realtime-client");
    const client = new RealtimeClient();

    client.joinRoom("timeline");
    client.leaveRoom("timeline");
    fakeSocket.__trigger("connect");

    expect(fakeSocket.emit).not.toHaveBeenCalledWith("join", "timeline");
  });

  it("disconnect tears down the socket and forgets rooms", async () => {
    const { RealtimeClient } = await import("./realtime-client");
    const client = new RealtimeClient();

    client.joinRoom("timeline");
    client.disconnect();

    expect(fakeSocket.disconnect).toHaveBeenCalled();

    fakeSocket.emit.mockClear();
    client.connect();
    fakeSocket.__trigger("connect");
    expect(fakeSocket.emit).not.toHaveBeenCalledWith("join", "timeline");
  });
});
