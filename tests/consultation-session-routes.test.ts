import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Rotas REST do ciclo de vida da sessao de consulta (FASE 1). Cobre:
 * autenticacao obrigatoria, idempotencia pratica de iniciar consulta
 * (retorna a sessao existente em vez de erro), guard de status nas
 * transicoes (notas/resumo so em in_progress; completar/cancelar so uma
 * vez), e que o checklist nunca bloqueia a finalizacao.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const admin: SessionPayload = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };
const BASE_URL = "https://brunanutri.com.br";

function mockAuth(authed = true) {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(authed ? admin : null) }));
}
function mockAudit() {
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
  vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "hash" }) }));
  vi.doMock("@/lib/repositories/client-timeline", () => ({ addTimelineEvent: vi.fn().mockResolvedValue("event-1") }));
}

describe("POST /api/admin/clients/[id]/consultation — iniciar", () => {
  it("401 sem sessao de admin", async () => {
    mockAuth(false);
    const { POST } = await import("../app/api/admin/clients/[id]/consultation/route");
    const response = await POST(new NextRequest(new URL("/api/admin/clients/c1/consultation", BASE_URL), { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "c1" }) });
    expect(response.status).toBe(401);
  });

  it("404 se o paciente nao existir", async () => {
    mockAuth();
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(null) }));
    const { POST } = await import("../app/api/admin/clients/[id]/consultation/route");
    const response = await POST(new NextRequest(new URL("/api/admin/clients/c1/consultation", BASE_URL), { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "c1" }) });
    expect(response.status).toBe(404);
  });

  it("cria a sessao e registra timeline/audit", async () => {
    mockAuth();
    mockAudit();
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "c1", name: "Maria" }) }));
    const startConsultationSession = vi.fn().mockResolvedValue({ id: "session-1", client_id: "c1", status: "in_progress" });
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({
      startConsultationSession,
      getActiveConsultationSession: vi.fn(),
      ConsultationSessionAlreadyActiveError: class extends Error {},
    }));
    const { POST } = await import("../app/api/admin/clients/[id]/consultation/route");
    const response = await POST(new NextRequest(new URL("/api/admin/clients/c1/consultation", BASE_URL), { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "c1" }) });
    expect(response.status).toBe(201);
    expect(startConsultationSession).toHaveBeenCalledWith({ clientId: "c1", adminId: "admin-1", appointmentId: null });
  });

  it("segunda tentativa (sessao ja em andamento) retorna a sessao existente, nunca 500", async () => {
    mockAuth();
    mockAudit();
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "c1", name: "Maria" }) }));
    class FakeAlreadyActive extends Error {}
    const existingSession = { id: "session-existing", client_id: "c1", status: "in_progress" };
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({
      startConsultationSession: vi.fn().mockRejectedValue(new FakeAlreadyActive()),
      getActiveConsultationSession: vi.fn().mockResolvedValue(existingSession),
      ConsultationSessionAlreadyActiveError: FakeAlreadyActive,
    }));
    const { POST } = await import("../app/api/admin/clients/[id]/consultation/route");
    const response = await POST(new NextRequest(new URL("/api/admin/clients/c1/consultation", BASE_URL), { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "c1" }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.session).toEqual(existingSession);
  });
});

describe("PATCH /api/admin/consultation-sessions/[id] — notas", () => {
  it("so aceita gravar notas quando a sessao ainda esta in_progress", async () => {
    mockAuth();
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({
      getConsultationSessionById: vi.fn().mockResolvedValue({ id: "s1", client_id: "c1", status: "completed" }),
      updateConsultationNotes: vi.fn(),
    }));
    const { PATCH } = await import("../app/api/admin/consultation-sessions/[id]/route");
    const response = await PATCH(new NextRequest(new URL("/api/admin/consultation-sessions/s1", BASE_URL), { method: "PATCH", body: JSON.stringify({ notes: "x" }) }), { params: Promise.resolve({ id: "s1" }) });
    expect(response.status).toBe(409);
  });

  it("grava as notas quando in_progress", async () => {
    mockAuth();
    const updateConsultationNotes = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({
      getConsultationSessionById: vi.fn().mockResolvedValue({ id: "s1", client_id: "c1", status: "in_progress" }),
      updateConsultationNotes,
    }));
    const { PATCH } = await import("../app/api/admin/consultation-sessions/[id]/route");
    const response = await PATCH(new NextRequest(new URL("/api/admin/consultation-sessions/s1", BASE_URL), { method: "PATCH", body: JSON.stringify({ notes: "Paciente relata fome à noite." }) }), { params: Promise.resolve({ id: "s1" }) });
    expect(response.status).toBe(200);
    expect(updateConsultationNotes).toHaveBeenCalledWith("s1", "Paciente relata fome à noite.");
  });
});

describe("POST /api/admin/consultation-sessions/[id]/complete — finalizar", () => {
  it("checklist nunca bloqueia: finaliza mesmo com tudo desmarcado", async () => {
    mockAuth();
    mockAudit();
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({
      getConsultationSessionById: vi.fn().mockResolvedValue({ id: "s1", client_id: "c1", status: "in_progress" }),
      completeConsultationSession: vi.fn().mockResolvedValue(true),
    }));
    const { POST } = await import("../app/api/admin/consultation-sessions/[id]/complete/route");
    const response = await POST(new NextRequest(new URL("/api/admin/consultation-sessions/s1/complete", BASE_URL), { method: "POST", body: JSON.stringify({ checklist: {} }) }), { params: Promise.resolve({ id: "s1" }) });
    expect(response.status).toBe(200);
  });

  it("409 ao tentar finalizar uma sessao que ja nao esta mais in_progress", async () => {
    mockAuth();
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({
      getConsultationSessionById: vi.fn().mockResolvedValue({ id: "s1", client_id: "c1", status: "completed" }),
      completeConsultationSession: vi.fn().mockResolvedValue(false),
    }));
    const { POST } = await import("../app/api/admin/consultation-sessions/[id]/complete/route");
    const response = await POST(new NextRequest(new URL("/api/admin/consultation-sessions/s1/complete", BASE_URL), { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "s1" }) });
    expect(response.status).toBe(409);
  });
});

describe("POST /api/admin/consultation-sessions/[id]/cancel", () => {
  it("cancela uma sessao in_progress", async () => {
    mockAuth();
    mockAudit();
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({
      getConsultationSessionById: vi.fn().mockResolvedValue({ id: "s1", client_id: "c1", status: "in_progress" }),
      cancelConsultationSession: vi.fn().mockResolvedValue(true),
    }));
    const { POST } = await import("../app/api/admin/consultation-sessions/[id]/cancel/route");
    const response = await POST(new NextRequest(new URL("/api/admin/consultation-sessions/s1/cancel", BASE_URL), { method: "POST" }), { params: Promise.resolve({ id: "s1" }) });
    expect(response.status).toBe(200);
  });
});

describe("POST /api/admin/consultation-sessions/[id]/brief", () => {
  it("409 se a consulta ja foi finalizada — nunca gera briefing de sessao fechada", async () => {
    mockAuth();
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({
      getConsultationSessionById: vi.fn().mockResolvedValue({ id: "s1", client_id: "c1", status: "completed" }),
      saveConsultationAiBrief: vi.fn(),
    }));
    const { POST } = await import("../app/api/admin/consultation-sessions/[id]/brief/route");
    const response = await POST(new NextRequest(new URL("/api/admin/consultation-sessions/s1/brief", BASE_URL), { method: "POST" }), { params: Promise.resolve({ id: "s1" }) });
    expect(response.status).toBe(409);
  });

  it("monta e salva o briefing quando a sessao esta em andamento", async () => {
    mockAuth();
    mockAudit();
    const saveConsultationAiBrief = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({
      getConsultationSessionById: vi.fn().mockResolvedValue({ id: "s1", client_id: "c1", status: "in_progress" }),
      saveConsultationAiBrief,
    }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "c1", name: "Maria" }) }));
    vi.doMock("@/lib/ai/agents/clinical/consultation-briefing", () => ({
      buildConsultationSystemData: vi.fn().mockResolvedValue({ lastVisit: {}, evolution: {}, pending: { tasks: [], patientRequests: [], upcomingAppointment: null }, activePlan: {}, activeProtocol: null }),
      generateConsultationAiBrief: vi.fn().mockResolvedValue(null),
    }));
    const { POST } = await import("../app/api/admin/consultation-sessions/[id]/brief/route");
    const response = await POST(new NextRequest(new URL("/api/admin/consultation-sessions/s1/brief", BASE_URL), { method: "POST" }), { params: Promise.resolve({ id: "s1" }) });
    expect(response.status).toBe(200);
    expect(saveConsultationAiBrief).toHaveBeenCalledWith("s1", expect.objectContaining({ aiBrief: null }));
  });
});
