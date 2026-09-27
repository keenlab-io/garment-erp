import { randomUUID } from "node:crypto";
import { expect, request as apiRequestFactory, test } from "@playwright/test";
import { io } from "socket.io-client";

/**
 * M7 tenancy isolation, browser/HTTP-level (task 15.4, TC-TEN-01..n). Provisions two real
 * tenants through the platform control plane and proves the isolation guarantee at every
 * surface the per-module integration suites can't reach on their own: cross-tenant HTTP 404s,
 * host-scoped login, and realtime room isolation.
 *
 * Requires a CLOUD-mode stack with a seeded `platform_admin` — the control plane this spec
 * drives doesn't exist in `DEPLOYMENT_MODE=self-hosted` (see `platform.module.spec.ts`), which
 * is the only mode `e2e.yml` runs today. Set `E2E_PLATFORM_ADMIN_EMAIL`/`E2E_PLATFORM_ADMIN_PASSWORD`
 * to run this against a cloud-mode stack; it self-skips otherwise, the same way the api's
 * `*.int.spec.ts` suite self-skips without `DATABASE_URL_TEST`.
 */

const APP_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
// Direct API origin (bypassing the Vite dev proxy), needed ONLY for the Host-header login probe
// below: the proxy's `changeOrigin: true` rewrites the outgoing Host to its target, so spoofing
// a tenant's hostname must go straight to the api.
const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3000";
const PLATFORM_ADMIN_EMAIL = process.env.E2E_PLATFORM_ADMIN_EMAIL;
const PLATFORM_ADMIN_PASSWORD = process.env.E2E_PLATFORM_ADMIN_PASSWORD;

test.describe("M7 tenancy isolation (TC-TEN-01..n)", () => {
  test.skip(
    !PLATFORM_ADMIN_EMAIL || !PLATFORM_ADMIN_PASSWORD,
    "requires a cloud-mode stack with a seeded platform_admin (E2E_PLATFORM_ADMIN_EMAIL/_PASSWORD) — self-hosted CI has no control plane",
  );

  const run = randomUUID().slice(0, 8);
  let tenantAId: string;
  let tokenA: string;
  let tokenB: string;
  let employeeAId: string;
  let usernameA: string;
  const hostA = `ten-a-${run}.e2e.example`;
  const hostB = `ten-b-${run}.e2e.example`;

  test.beforeAll(async ({ request }) => {
    const login = await request.post(`${APP_BASE_URL}/api/v1/platform/auth/login`, {
      data: { email: PLATFORM_ADMIN_EMAIL, password: PLATFORM_ADMIN_PASSWORD },
    });
    expect(login.ok(), await login.text()).toBe(true);
    const platformToken = (await login.json()).access_token as string;
    const auth = { Authorization: `Bearer ${platformToken}` };

    const createTenant = async (slug: string, host: string) => {
      const res = await request.post(`${APP_BASE_URL}/api/v1/platform/tenants`, {
        headers: auth,
        data: { name: `Tenancy e2e ${slug}`, slug, domain: host },
      });
      expect(res.ok(), await res.text()).toBe(true);
      return ((await res.json()).tenant as { id: string }).id;
    };
    tenantAId = await createTenant(`ten-a-${run}`, hostA);
    const tenantBId = await createTenant(`ten-b-${run}`, hostB);

    const openSupportSession = async (tenantId: string) => {
      const res = await request.post(`${APP_BASE_URL}/api/v1/platform/support-sessions`, {
        headers: auth,
        data: { tenant_id: tenantId, reason: `tenancy e2e ${run}`, minutes: 30 },
      });
      expect(res.ok(), await res.text()).toBe(true);
      return (await res.json()).access_token as string;
    };
    tokenA = await openSupportSession(tenantAId);
    tokenB = await openSupportSession(tenantBId);

    // A real, logged-in user in tenant A — for the host-scoped login probe.
    usernameA = `a-user-${run}`;
    const createUser = await request.post(`${APP_BASE_URL}/api/v1/users`, {
      headers: { Authorization: `Bearer ${tokenA}` },
      data: {
        username: usernameA,
        email: `${usernameA}@e2e.example`,
        role_ids: [],
        temp_password: "Sup3r-Secret!",
      },
    });
    expect(createUser.ok(), await createUser.text()).toBe(true);

    // A document tenant A owns — the id every "as B" probe below targets.
    const employee = await request.post(`${APP_BASE_URL}/api/v1/employees`, {
      headers: { Authorization: `Bearer ${tokenA}` },
      data: {
        first_name: "Tenant",
        last_name: "A-owned",
        employment_type: "MONTHLY",
        hire_date: "2024-01-01",
        profile: {},
      },
    });
    expect(employee.ok(), await employee.text()).toBe(true);
    employeeAId = ((await employee.json()).employee as { id: string }).id;
  });

  test("as tenant B, the employees list never includes tenant A's rows", async ({ request }) => {
    const res = await request.get(`${APP_BASE_URL}/api/v1/employees?limit=100`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(res.ok()).toBe(true);
    const ids = ((await res.json()).data as { id: string }[]).map((e) => e.id);
    expect(ids).not.toContain(employeeAId);
  });

  test("a direct GET of tenant A's employee id, as tenant B, 404s", async ({ request }) => {
    const res = await request.get(`${APP_BASE_URL}/api/v1/employees/${employeeAId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(res.status()).toBe(404);
  });

  test("a signed-URL request against tenant A's employee, as tenant B, errors before reaching storage", async ({
    request,
  }) => {
    const res = await request.get(
      `${APP_BASE_URL}/api/v1/employees/${employeeAId}/documents/${randomUUID()}/url`,
      { headers: { Authorization: `Bearer ${tokenB}` }, maxRedirects: 0 },
    );
    // The employee row itself is invisible under B's RLS scope, so this 404s before the
    // document lookup (or the presign call) ever runs.
    expect(res.status()).toBe(404);
  });

  test("tenant A's username on tenant B's host is unknown — 401, not tenant A's account", async () => {
    const api = await apiRequestFactory.newContext({ baseURL: API_BASE_URL });
    try {
      const res = await api.post("/api/v1/auth/login", {
        headers: { Host: hostB },
        data: { username: usernameA, password: "Sup3r-Secret!" },
      });
      expect(res.status()).toBe(401);
    } finally {
      await api.dispose();
    }
  });

  test("tenant B's socket cannot join tenant A's rooms", async () => {
    const socket = io(APP_BASE_URL, { path: "/socket.io", auth: { token: tokenB }, transports: ["websocket"] });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.on("connect", () => resolve());
        socket.on("connect_error", reject);
      });
      const woAck = await socket.emitWithAck("join", `t:${tenantAId}:wo:${randomUUID()}`);
      expect(woAck).toEqual({ ok: false });
      const timelineAck = await socket.emitWithAck("join", `t:${tenantAId}:timeline`);
      expect(timelineAck).toEqual({ ok: false });
    } finally {
      socket.disconnect();
    }
  });
});
