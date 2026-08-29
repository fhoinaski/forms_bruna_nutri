import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function request(body: unknown) {
  return new NextRequest("https://brunanutri.com.br/api/admin/clients/client-1/portal-access", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/admin/clients/[id]/portal-access temporary password", () => {
  it("returns plaintext once, stores only its hash, and supersedes tokens and sessions", async () => {
    const revokePatientPortalTokens = vi.fn().mockResolvedValue(undefined);
    const revokePatientPortalSessions = vi.fn().mockResolvedValue(undefined);
    const setPatientPortalPassword = vi.fn().mockResolvedValue(undefined);
    const writeAuditLog = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue({ sub: "admin-1" }) }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", email: "patient@example.com" }) }));
    vi.doMock("@/lib/repositories/patient-portal-auth", () => ({
      getPatientPortalAccess: vi.fn(), getOrCreatePatientPortalAccess: vi.fn().mockResolvedValue({ id: "access-1" }),
      issuePatientPortalToken: vi.fn(), revokePatientPortalAccess: vi.fn(), revokePatientPortalTokens, revokePatientPortalSessions, setPatientPortalPassword,
    }));
    vi.doMock("@/lib/auth/patient-portal-credentials", () => ({
      generateTemporaryPatientPortalPassword: vi.fn().mockReturnValue("temporary-secret"),
      hashPatientPortalPassword: vi.fn().mockResolvedValue("bcrypt-only"),
    }));
    vi.doMock("@/lib/security/audit", () => ({ writeAuditLog }));
    vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "ip-hash" }) }));
    vi.doMock("@/lib/email/client", () => ({ sendEmail: vi.fn() }));
    vi.doMock("@/lib/email/templates", () => ({ patientPortalInviteEmail: vi.fn() }));

    const { POST } = await import("../app/api/admin/clients/[id]/portal-access/route");
    const response = await POST(request({ action: "temporary_password" }), { params: Promise.resolve({ id: "client-1" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ temporary_password: "temporary-secret" }));
    expect(revokePatientPortalTokens).toHaveBeenCalledWith("access-1");
    expect(revokePatientPortalSessions).toHaveBeenCalledWith("access-1");
    expect(setPatientPortalPassword).toHaveBeenCalledWith(expect.objectContaining({ accessId: "access-1", passwordHash: "bcrypt-only", mustChangePassword: true }));
    expect(JSON.stringify(writeAuditLog.mock.calls)).not.toContain("temporary-secret");
  });
});
