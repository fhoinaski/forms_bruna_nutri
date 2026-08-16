import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const BASE_URL = "https://brunanutri.com.br";

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(new URL(path, BASE_URL), init);
}

describe("appointment brief route", () => {
  it("GET exige sessão admin", async () => {
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/clinical/appointment-briefing", () => ({ getAppointmentBriefState: vi.fn() }));
    const { GET } = await import("../app/api/admin/appointments/[id]/brief/route");
    const response = await GET(request("/api/admin/appointments/a1/brief"), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(401);
  });

  it("POST regenera manualmente quando autenticado", async () => {
    const prepareAppointmentAiBrief = vi.fn().mockResolvedValue({ outcome: "generated", reason: null });
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue({ sub: "admin-1" }) }));
    vi.doMock("@/lib/clinical/appointment-briefing", () => ({
      prepareAppointmentAiBrief,
      getAppointmentBriefState: vi.fn().mockResolvedValue({ appointmentId: "a1", status: "ready", brief: null }),
    }));
    vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "ip" }) }));
    const { POST } = await import("../app/api/admin/appointments/[id]/brief/route");
    const response = await POST(request("/api/admin/appointments/a1/brief", { method: "POST", body: JSON.stringify({ force: true }) }), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(200);
    expect(prepareAppointmentAiBrief).toHaveBeenCalledWith("a1", { adminId: "admin-1", force: true });
  });
});

describe("prepare upcoming appointment briefs cron", () => {
  it("bloqueia execução pública sem segredo", async () => {
    vi.doMock("@/lib/security/cron", () => ({ verifyCronSecret: vi.fn().mockReturnValue(false) }));
    vi.doMock("@/lib/clinical/appointment-briefing", () => ({ prepareUpcomingConsultationBriefs: vi.fn() }));
    const { GET } = await import("../app/api/admin/appointment-briefs/prepare-upcoming/route");
    const response = await GET(request("/api/admin/appointment-briefs/prepare-upcoming"));
    expect(response.status).toBe(401);
  });

  it("executa job quando segredo é válido", async () => {
    const prepareUpcomingConsultationBriefs = vi.fn().mockResolvedValue({ processed: 1, generated: 1 });
    vi.doMock("@/lib/security/cron", () => ({ verifyCronSecret: vi.fn().mockReturnValue(true) }));
    vi.doMock("@/lib/clinical/appointment-briefing", () => ({ prepareUpcomingConsultationBriefs }));
    const { POST } = await import("../app/api/admin/appointment-briefs/prepare-upcoming/route");
    const response = await POST(request("/api/admin/appointment-briefs/prepare-upcoming", { method: "POST" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.generated).toBe(1);
    expect(prepareUpcomingConsultationBriefs).toHaveBeenCalled();
  });
});
