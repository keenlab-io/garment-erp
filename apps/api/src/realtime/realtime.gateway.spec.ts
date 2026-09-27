import type { Socket } from "socket.io";
import { describe, expect, it, vi } from "vitest";
import type { TokenService } from "../auth/token.service.js";
import { parseRoom, RealtimeGateway, tenantRoom } from "./realtime.gateway.js";

// M7 §7.3 / design D12 — rooms are `t:{tid}:…`; a socket joins only its own tenant's rooms.

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const WO = "11111111-2222-4333-8444-555555555555";

function socket(tenantId?: string) {
  const join = vi.fn();
  return { client: { id: "s1", data: { tenantId }, join } as unknown as Socket, join };
}

const gateway = () => new RealtimeGateway({} as TokenService);

describe("tenantRoom / parseRoom", () => {
  it("builds t:{tid}:{suffix} and refuses a malformed tenant id", () => {
    expect(tenantRoom(A, `wo:${WO}`)).toBe(`t:${A}:wo:${WO}`);
    expect(() => tenantRoom("nope", "timeline")).toThrow();
  });

  it("parses scoped and bare sub-rooms; rejects anything else", () => {
    expect(parseRoom(`t:${A}:timeline`)).toEqual({ tenantId: A, suffix: "timeline" });
    expect(parseRoom(`wo:${WO}`)).toEqual({ tenantId: null, suffix: `wo:${WO}` });
    for (const bad of [`t:nope:timeline`, `t:${A}:lobby`, "lobby", `wo:${WO}x`, 42, null]) {
      expect(parseRoom(bad)).toBeNull();
    }
  });
});

describe("RealtimeGateway.handleJoin", () => {
  it("joins its own tenant's room", () => {
    const { client, join } = socket(A);
    expect(gateway().handleJoin(client, `t:${A}:wo:${WO}`)).toEqual({
      ok: true,
      room: `t:${A}:wo:${WO}`,
    });
    expect(join).toHaveBeenCalledWith(`t:${A}:wo:${WO}`);
  });

  it("scopes a bare sub-room to the socket's tenant", () => {
    const { client, join } = socket(A);
    expect(gateway().handleJoin(client, "timeline")).toEqual({ ok: true, room: `t:${A}:timeline` });
    expect(join).toHaveBeenCalledWith(`t:${A}:timeline`);
  });

  it("rejects another tenant's rooms", () => {
    const { client, join } = socket(B);
    expect(gateway().handleJoin(client, `t:${A}:wo:${WO}`)).toEqual({ ok: false });
    expect(gateway().handleJoin(client, `t:${A}:timeline`)).toEqual({ ok: false });
    expect(join).not.toHaveBeenCalled();
  });

  it("rejects a socket with no bound tenant", () => {
    const { client, join } = socket(undefined);
    expect(gateway().handleJoin(client, "timeline")).toEqual({ ok: false });
    expect(join).not.toHaveBeenCalled();
  });
});
