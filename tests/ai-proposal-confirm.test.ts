import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const BASE_URL = "https://brunanutri.com.br";
const admin: SessionPayload = {
  sub: "admin-1",
  email: "bruna@example.com",
  name: "Bruna",
  mustChangePassword: false,
  sessionVersion: 1,
};

const validAppointmentAction = {
  kind: "new_appointment" as const,
  clientId: "client-1",
  fields: {
    title: "Retorno",
    appointment_type: "retorno",
    starts_at_display: "13/08/2026 15:00",
    location: "",
    notes: "",
  },
  risk: "sensitive" as const,
  requiresConfirmation: true,
};

function pendingProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "proposal-1",
    admin_id: "admin-1",
    tool_name: "proposeNewAppointment",
    kind: "new_appointment",
    risk: "sensitive",
    client_id: "client-1",
    submission_id: null,
    params_json: JSON.stringify(validAppointmentAction),
    status: "pending",
    created_at: "2026-08-10T00:00:00.000Z",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    completed_at: null,
    ...overrides,
  };
}

function makeRequest(): NextRequest {
  return new NextRequest(new URL("/api/admin/ai/proposals/proposal-1/confirm", BASE_URL), { method: "POST" });
}

function mockCommonDeps() {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(admin) }));
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn() }));
  vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "hash" }) }));
}

describe("teste 4: confirmar agendamento — execucao real gated pela proposta persistida", () => {
  it("cria a consulta quando o horario ainda esta livre e marca a proposta como completed", async () => {
    mockCommonDeps();
    const markStatus = vi.fn();
    const createAppointment = vi.fn().mockResolvedValue("appointment-1");
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      getAiActionProposal: vi.fn().mockResolvedValue(pendingProposal()),
      isAiActionProposalExpired: vi.fn().mockReturnValue(false),
      markAiActionProposalStatus: markStatus,
    }));
    vi.doMock("@/lib/repositories/availability", () => ({
      hasAppointmentConflict: vi.fn().mockResolvedValue(false),
      slotEnd: vi.fn().mockReturnValue("2026-08-13T19:00:00.000Z"),
    }));
    vi.doMock("@/lib/repositories/appointments", () => ({ createAppointment }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "proposal-1" }) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "completed", kind: "new_appointment", appointmentId: "appointment-1" });
    expect(createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "client-1", title: "Retorno", status: "agendado" })
    );
    expect(markStatus).toHaveBeenCalledWith("proposal-1", "completed");
  });

  it("nao aceita alterar o cliente/horario via corpo da requisicao — so usa o que foi persistido", async () => {
    mockCommonDeps();
    const createAppointment = vi.fn().mockResolvedValue("appointment-1");
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      getAiActionProposal: vi.fn().mockResolvedValue(pendingProposal()),
      isAiActionProposalExpired: vi.fn().mockReturnValue(false),
      markAiActionProposalStatus: vi.fn(),
    }));
    vi.doMock("@/lib/repositories/availability", () => ({
      hasAppointmentConflict: vi.fn().mockResolvedValue(false),
      slotEnd: vi.fn().mockReturnValue("2026-08-13T19:00:00.000Z"),
    }));
    vi.doMock("@/lib/repositories/appointments", () => ({ createAppointment }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const tamperedRequest = new NextRequest(new URL("/api/admin/ai/proposals/proposal-1/confirm", BASE_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "OUTRO-CLIENTE", fields: { title: "Titulo forjado" } }),
    });
    await POST(tamperedRequest, { params: Promise.resolve({ id: "proposal-1" }) });

    expect(createAppointment).toHaveBeenCalledWith(expect.objectContaining({ client_id: "client-1", title: "Retorno" }));
  });
});

describe("teste 9: slot ocupado entre proposta e confirmacao -> execucao rejeitada", () => {
  it("revalida o horario no servidor e rejeita se outro agendamento ocupou o slot nesse meio-tempo", async () => {
    mockCommonDeps();
    const markStatus = vi.fn();
    const createAppointment = vi.fn();
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      getAiActionProposal: vi.fn().mockResolvedValue(pendingProposal()),
      isAiActionProposalExpired: vi.fn().mockReturnValue(false),
      markAiActionProposalStatus: markStatus,
    }));
    vi.doMock("@/lib/repositories/availability", () => ({
      hasAppointmentConflict: vi.fn().mockResolvedValue(true),
      slotEnd: vi.fn().mockReturnValue("2026-08-13T19:00:00.000Z"),
    }));
    vi.doMock("@/lib/repositories/appointments", () => ({ createAppointment }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "proposal-1" }) });

    expect(response.status).toBe(409);
    expect(createAppointment).not.toHaveBeenCalled();
    expect(markStatus).not.toHaveBeenCalledWith("proposal-1", "completed");
  });
});

describe("teste 10: replay de confirmacao -> rejeitado", () => {
  it("confirmar uma proposta ja completed nao cria uma segunda consulta", async () => {
    mockCommonDeps();
    const createAppointment = vi.fn();
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      getAiActionProposal: vi.fn().mockResolvedValue(pendingProposal({ status: "completed", completed_at: "2026-08-10T00:01:00.000Z" })),
      isAiActionProposalExpired: vi.fn().mockReturnValue(false),
      markAiActionProposalStatus: vi.fn(),
    }));
    vi.doMock("@/lib/repositories/availability", () => ({ hasAppointmentConflict: vi.fn(), slotEnd: vi.fn() }));
    vi.doMock("@/lib/repositories/appointments", () => ({ createAppointment }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "proposal-1" }) });

    expect(response.status).toBe(409);
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("confirmar uma proposta descartada (cancelled) tambem e rejeitado", async () => {
    mockCommonDeps();
    const createAppointment = vi.fn();
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      getAiActionProposal: vi.fn().mockResolvedValue(pendingProposal({ status: "cancelled" })),
      isAiActionProposalExpired: vi.fn().mockReturnValue(false),
      markAiActionProposalStatus: vi.fn(),
    }));
    vi.doMock("@/lib/repositories/availability", () => ({ hasAppointmentConflict: vi.fn(), slotEnd: vi.fn() }));
    vi.doMock("@/lib/repositories/appointments", () => ({ createAppointment }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "proposal-1" }) });

    expect(response.status).toBe(409);
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("proposta expirada e marcada como expired e rejeitada com 410", async () => {
    mockCommonDeps();
    const markStatus = vi.fn();
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      getAiActionProposal: vi.fn().mockResolvedValue(pendingProposal({ expires_at: "2020-01-01T00:00:00.000Z" })),
      isAiActionProposalExpired: vi.fn().mockReturnValue(true),
      markAiActionProposalStatus: markStatus,
    }));
    vi.doMock("@/lib/repositories/availability", () => ({ hasAppointmentConflict: vi.fn(), slotEnd: vi.fn() }));
    vi.doMock("@/lib/repositories/appointments", () => ({ createAppointment: vi.fn() }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "proposal-1" }) });

    expect(response.status).toBe(410);
    expect(markStatus).toHaveBeenCalledWith("proposal-1", "expired");
  });

  it("uma proposta que nao pertence a este admin (ou nao existe) e tratada como nao encontrada", async () => {
    mockCommonDeps();
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      getAiActionProposal: vi.fn().mockResolvedValue(null),
      isAiActionProposalExpired: vi.fn(),
      markAiActionProposalStatus: vi.fn(),
    }));
    vi.doMock("@/lib/repositories/availability", () => ({ hasAppointmentConflict: vi.fn(), slotEnd: vi.fn() }));
    vi.doMock("@/lib/repositories/appointments", () => ({ createAppointment: vi.fn() }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "proposal-1" }) });

    expect(response.status).toBe(404);
  });
});
