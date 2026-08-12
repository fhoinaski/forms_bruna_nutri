import { NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

const COOKIE_NAME = "bruna_nutri_admin_session";
const BASE_URL = "https://brunanutri.com.br";

const verifySessionToken = vi.fn<(token: string) => Promise<SessionPayload | null>>();
const createInternalSessionAssertion = vi.fn<(session: SessionPayload) => Promise<string>>();
const writeAuditLog = vi.fn();
const verifyCronSecret = vi.fn<(req: NextRequest) => boolean>();

vi.mock("@/lib/auth/session", () => ({
  INTERNAL_SESSION_HEADER: "x-bruna-admin-session",
  verifySessionToken,
  createInternalSessionAssertion,
}));

vi.mock("@/lib/security/audit", () => ({
  writeAuditLog,
}));

vi.mock("@/lib/security/cron", () => ({
  verifyCronSecret,
}));

function makeRequest(path: string, options: { method?: string; sessionToken?: string; origin?: string | null; cronHeader?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (options.origin !== undefined && options.origin !== null) headers.origin = options.origin;
  if (options.cronHeader) headers["x-cron-secret"] = options.cronHeader;
  const request = new NextRequest(new URL(path, BASE_URL), {
    method: options.method ?? "GET",
    headers,
  });
  if (options.sessionToken) {
    request.cookies.set(COOKIE_NAME, options.sessionToken);
  }
  return request;
}

// NextFetchEvent has private/symbol-keyed fields and isn't constructible from
// "next/server" at runtime, so we build a minimal double covering the only
// member proxy.ts actually calls: waitUntil(). The cast is narrow and test-only.
function makeEvent(): NextFetchEvent {
  const stub = { waitUntil: (promise: Promise<unknown>) => { promise.catch(() => {}); } };
  return stub as unknown as NextFetchEvent;
}

const validSession: SessionPayload = {
  sub: "admin_1",
  email: "bruna@example.com",
  name: "Bruna",
  mustChangePassword: false,
  sessionVersion: 1,
};

describe("proxy (auth gateway)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createInternalSessionAssertion.mockResolvedValue("internal-assertion-token");
    verifyCronSecret.mockReturnValue(false);
    writeAuditLog.mockResolvedValue(undefined);
  });

  it("redirects an unauthenticated user away from /dashboard to /login", async () => {
    const { proxy } = await import("../proxy");
    verifySessionToken.mockResolvedValue(null);

    const request = makeRequest("/dashboard");
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${BASE_URL}/login`);
  });

  it("rejects an unauthenticated request to a protected /api/admin/** endpoint with 401", async () => {
    const { proxy } = await import("../proxy");
    verifySessionToken.mockResolvedValue(null);

    const request = makeRequest("/api/admin/clients");
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ message: "Nao autorizado." });
  });

  it("treats an invalid/expired session cookie the same as no session", async () => {
    const { proxy } = await import("../proxy");
    verifySessionToken.mockResolvedValue(null);

    const request = makeRequest("/api/admin/clients", { sessionToken: "garbage-or-expired-token" });
    const response = await proxy(request, makeEvent());

    expect(verifySessionToken).toHaveBeenCalledWith("garbage-or-expired-token");
    expect(response.status).toBe(401);
  });

  it("lets a valid session continue through to /dashboard", async () => {
    const { proxy } = await import("../proxy");
    verifySessionToken.mockResolvedValue(validSession);

    const request = makeRequest("/dashboard", { sessionToken: "valid-token" });
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("attaches a signed internal session assertion header for downstream route handlers once authenticated", async () => {
    const { proxy } = await import("../proxy");
    verifySessionToken.mockResolvedValue(validSession);

    const request = makeRequest("/api/admin/clients", { sessionToken: "valid-token" });
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(200);
    expect(createInternalSessionAssertion).toHaveBeenCalledWith(validSession);
    expect(response.headers.get("x-middleware-request-x-bruna-admin-session")).toBe("internal-assertion-token");
  });

  it("redirects to the forced password-change screen when mustChangePassword is set", async () => {
    const { proxy } = await import("../proxy");
    verifySessionToken.mockResolvedValue({ ...validSession, mustChangePassword: true });

    const request = makeRequest("/dashboard/clients", { sessionToken: "valid-token" });
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${BASE_URL}/dashboard/settings/security`);
  });

  it("does not redirect-loop when already on the forced password-change screen", async () => {
    const { proxy } = await import("../proxy");
    verifySessionToken.mockResolvedValue({ ...validSession, mustChangePassword: true });

    const request = makeRequest("/dashboard/settings/security", { sessionToken: "valid-token" });
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("sends an authenticated user away from /login back to the dashboard", async () => {
    const { proxy } = await import("../proxy");
    verifySessionToken.mockResolvedValue(validSession);

    const request = makeRequest("/login", { sessionToken: "valid-token" });
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${BASE_URL}/dashboard`);
  });

  it("rejects a cross-origin mutation against /api/admin/** even with a valid session (CSRF/origin check)", async () => {
    const { proxy } = await import("../proxy");
    verifySessionToken.mockResolvedValue(validSession);

    const request = makeRequest("/api/admin/clients", {
      method: "POST",
      sessionToken: "valid-token",
      origin: "https://evil-attacker.example",
    });
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({ message: "Origem nao permitida." });
    expect(verifySessionToken).not.toHaveBeenCalled();
  });

  it("allows a same-origin mutation against /api/admin/** with a valid session", async () => {
    const { proxy } = await import("../proxy");
    verifySessionToken.mockResolvedValue(validSession);

    const request = makeRequest("/api/admin/clients", {
      method: "POST",
      sessionToken: "valid-token",
      origin: BASE_URL,
    });
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(200);
  });

  it("allows a mutation with no Origin header at all (non-browser/same-origin request without the header)", async () => {
    const { proxy } = await import("../proxy");
    verifySessionToken.mockResolvedValue(validSession);

    const request = makeRequest("/api/admin/clients", {
      method: "POST",
      sessionToken: "valid-token",
      origin: null,
    });
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(200);
  });

  it("logs an audit entry for authenticated admin mutations", async () => {
    const { proxy } = await import("../proxy");
    verifySessionToken.mockResolvedValue(validSession);

    const request = makeRequest("/api/admin/clients", {
      method: "POST",
      sessionToken: "valid-token",
      origin: BASE_URL,
    });
    await proxy(request, makeEvent());

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin_mutation_requested",
        adminId: validSession.sub,
        entityType: "api_route",
        entityId: "/api/admin/clients",
      })
    );
  });

  it("does not audit-log a GET (non-mutation) admin API request", async () => {
    const { proxy } = await import("../proxy");
    verifySessionToken.mockResolvedValue(validSession);

    const request = makeRequest("/api/admin/clients", { sessionToken: "valid-token" });
    await proxy(request, makeEvent());

    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("lets public pages through untouched, without checking the session", async () => {
    const { proxy } = await import("../proxy");

    for (const path of ["/", "/blog", "/formulario", "/servicos", "/como-funciona"]) {
      const request = makeRequest(path);
      const response = await proxy(request, makeEvent());
      expect(response.status).toBe(200);
    }
    expect(verifySessionToken).not.toHaveBeenCalled();
  });

  it("lets patient-portal API requests through without requiring an admin session", async () => {
    const { proxy } = await import("../proxy");

    const request = makeRequest("/api/portal/me");
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(200);
    expect(verifySessionToken).not.toHaveBeenCalled();
  });

  it("still blocks a cross-origin mutation against the patient portal API (CSRF check runs before the portal bypass)", async () => {
    const { proxy } = await import("../proxy");

    const request = makeRequest("/api/portal/appointments", { method: "POST", origin: "https://evil-attacker.example" });
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(403);
  });

  it("blocks a cross-origin mutation against the public intake API (CSRF/origin check)", async () => {
    const { proxy } = await import("../proxy");

    const request = makeRequest("/api/public/pre-consultation/intake/message", {
      method: "POST",
      origin: "https://evil-attacker.example",
    });
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(403);
  });

  it("allows a same-origin mutation against the public intake API", async () => {
    const { proxy } = await import("../proxy");

    const request = makeRequest("/api/public/pre-consultation/intake/message", {
      method: "POST",
      origin: BASE_URL,
    });
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(200);
  });

  it("allows a cron job with a valid shared secret to bypass session auth on the whitelisted cron endpoint", async () => {
    const { proxy } = await import("../proxy");
    verifyCronSecret.mockReturnValue(true);

    const request = makeRequest("/api/admin/payments/notify-overdue", { cronHeader: "the-real-secret" });
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(200);
    expect(verifySessionToken).not.toHaveBeenCalled();
  });

  it("falls back to normal session auth on the cron endpoint when the cron secret is missing/invalid", async () => {
    const { proxy } = await import("../proxy");
    verifyCronSecret.mockReturnValue(false);
    verifySessionToken.mockResolvedValue(null);

    const request = makeRequest("/api/admin/payments/notify-overdue", { cronHeader: "wrong-secret" });
    const response = await proxy(request, makeEvent());

    expect(response.status).toBe(401);
  });

  it("exports the matcher config covering protected routes and the public API", async () => {
    const { config } = await import("../proxy");

    expect(config.matcher).toEqual(
      expect.arrayContaining([
        "/login",
        "/dashboard/:path*",
        "/api/admin/:path*",
        "/api/auth/:path*",
        "/api/portal/:path*",
        "/api/public/:path*",
      ])
    );
  });

  it("exports a function named 'proxy' matching the file name, as required by Next.js 16's proxy convention", async () => {
    const proxyModule = await import("../proxy");

    expect(typeof proxyModule.proxy).toBe("function");
  });
});
