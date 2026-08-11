import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";
import type { ClientPortalSession } from "@/lib/auth/client-portal-session";
import type { ProposedAction } from "@/lib/ai/schemas/action.schema";

/**
 * patient_appointment_request — secao 14/15/41/46 do pedido: autoagendamento
 * via assistente, mesma revalidacao de slot/limite de 1 consulta futura que
 * a rota manual (app/api/portal/appointments) ja usa, e as rotas
 * /api/portal/ai/proposals/[id]/**  isoladas do admin, com IDOR e kind
 * travados.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const clientA: SessionPayload = { sub: "client-A", email: "a@example.com", name: "A", mustChangePassword: false, sessionVersion: 1 };
void clientA;

const sessionA: ClientPortalSession = { sub: "client-A", type: "client_portal", sessionVersion: 1 };
const sessionB: ClientPortalSession = { sub: "client-B", type: "client_portal", sessionVersion: 1 };

function validAction(overrides: Partial<ProposedAction & { kind: "patient_appointment_request" }> = {}): ProposedAction {
  return {
    kind: "patient_appointment_request", clientId: "client-A", startsAtIso: "2099-01-01T15:00:00.000Z",
    risk: "sensitive", requiresConfirmation: true,
    ...overrides,
  } as ProposedAction;
}

// ── handler: mesmas regras da rota manual de autoagendamento ────────────

describe("executeProposedAction — patient_appointment_request (handler)", () => {
  it("horario no passado é rejeitado (422)", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria" }) }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(validAction({ startsAtIso: "2020-01-01T15:00:00.000Z" }), { adminId: "client-A" }))
      .rejects.toMatchObject({ status: 422 });
  });

  it("paciente que ja tem consulta futura é barrado (409) — mesma regra antiabuso da rota manual", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/availability", () => ({
      countFutureClientAppointments: vi.fn().mockResolvedValue(1),
      getAvailableSlots: vi.fn(),
      hasAppointmentConflict: vi.fn(),
      slotEnd: vi.fn((iso: string) => iso),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(validAction(), { adminId: "client-A" })).rejects.toMatchObject({ status: 409 });
  });

  it("horario nao esta mais disponivel (conflito revalidado no confirm) → 409", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/availability", () => ({
      countFutureClientAppointments: vi.fn().mockResolvedValue(0),
      getAvailableSlots: vi.fn().mockResolvedValue([{ date: "2099-01-01", slots: ["2099-01-01T15:00:00.000Z"] }]),
      hasAppointmentConflict: vi.fn().mockResolvedValue(true),
      slotEnd: vi.fn((iso: string) => iso),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(validAction(), { adminId: "client-A" })).rejects.toMatchObject({ status: 409 });
  });

  it("caminho feliz: cria a consulta com portal_visible=1 e nota identificando origem via assistente", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/availability", () => ({
      countFutureClientAppointments: vi.fn().mockResolvedValue(0),
      getAvailableSlots: vi.fn().mockResolvedValue([{ date: "2099-01-01", slots: ["2099-01-01T15:00:00.000Z"] }]),
      hasAppointmentConflict: vi.fn().mockResolvedValue(false),
      slotEnd: vi.fn((iso: string) => new Date(new Date(iso).getTime() + 3_600_000).toISOString()),
    }));
    const createAppointment = vi.fn().mockResolvedValue("appointment-real-1");
    vi.doMock("@/lib/repositories/appointments", () => ({ createAppointment }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");

    const result = await executeProposedAction(validAction(), { adminId: "client-A" });

    expect(createAppointment).toHaveBeenCalledWith(expect.objectContaining({
      client_id: "client-A", portal_visible: 1, status: "agendado",
    }));
    expect(result).toEqual({ data: { appointmentId: "appointment-real-1", startsAtIso: "2099-01-01T15:00:00.000Z" } });
  });
});

// ── builder: clientId sempre do ctx (sessao), nunca do input do modelo ──

describe("buildProposedAction — requestAppointment", () => {
  it("usa ctx.clientId, ignora qualquer clientId que estivesse no input do modelo", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const forged = buildProposedAction(
      "requestAppointment",
      { startsAtIso: "2099-01-01T15:00:00.000Z", clientId: "client-B-TENTATIVA-FORJADA" },
      { clientId: "client-A" }
    );
    expect(forged).toMatchObject({ kind: "patient_appointment_request", clientId: "client-A" });
  });

  it("sem clientId no contexto (sessao ausente), nunca monta proposta", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    expect(buildProposedAction("requestAppointment", { startsAtIso: "2099-01-01T15:00:00.000Z" }, {})).toBeNull();
  });
});

// ── rotas /api/portal/ai/proposals/[id] — IDOR e kind travados ──────────

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://brunanutri.com.br"), { method: "POST" });
}

class FakeProposalsDb {
  private rows = new Map<string, { id: string; admin_id: string; kind: string; status: string; params_json: string; expires_at: string }>();
  private executions = new Map<string, Record<string, unknown>>();

  seed(row: { id: string; admin_id: string; kind: string; status?: string; params_json: string; expires_at?: string }) {
    this.rows.set(row.id, {
      id: row.id, admin_id: row.admin_id, kind: row.kind, status: row.status ?? "pending",
      params_json: row.params_json, expires_at: row.expires_at ?? new Date(Date.now() + 60_000).toISOString(),
    });
  }
  async claim(id: string, ownerId: string) {
    const row = this.rows.get(id);
    if (!row || row.admin_id !== ownerId || row.status !== "pending") return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) return null;
    row.status = "executing";
    return { ...row };
  }
  async cancel(id: string, ownerId: string) {
    const row = this.rows.get(id);
    if (!row || row.admin_id !== ownerId || row.status !== "pending") return false;
    row.status = "cancelled";
    return true;
  }
  async finalize(id: string, status: "completed" | "failed") {
    const row = this.rows.get(id);
    if (row) row.status = status;
  }
  async get(id: string, ownerId: string) {
    const row = this.rows.get(id);
    return row && row.admin_id === ownerId ? { ...row } : null;
  }
  async getExecution(id: string) {
    const result = this.executions.get(id);
    return result ? { proposal_id: id, kind: "x", result_json: JSON.stringify(result) } : null;
  }
  async recordExecution(id: string, _kind: string, result: Record<string, unknown>) {
    if (!this.executions.has(id)) this.executions.set(id, result);
  }
  statusOf(id: string) {
    return this.rows.get(id)?.status;
  }
}

function mockRepo(db: FakeProposalsDb) {
  vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
    claimAiActionProposal: (id: string, ownerId: string) => db.claim(id, ownerId),
    cancelAiActionProposal: (id: string, ownerId: string) => db.cancel(id, ownerId),
    finalizeAiActionProposal: (id: string, status: "completed" | "failed") => db.finalize(id, status),
    getAiActionProposal: (id: string, ownerId: string) => db.get(id, ownerId),
    markAiActionProposalExpired: vi.fn(),
    isAiActionProposalExpired: () => false,
    getProposalExecution: (id: string) => db.getExecution(id),
    recordProposalExecution: (id: string, kind: string, result: Record<string, unknown>) => db.recordExecution(id, kind, result),
  }));
}

describe("POST /api/portal/ai/proposals/[id]/confirm — IDOR e kind travados", () => {
  it("sem sessao → 401", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(null) }));
    const { POST } = await import("../app/api/portal/ai/proposals/[id]/confirm/route");
    const response = await POST(makeRequest("/api/portal/ai/proposals/p1/confirm"), { params: Promise.resolve({ id: "p1" }) });
    expect(response.status).toBe(401);
  });

  it("paciente B nunca consegue confirmar uma proposta que pertence ao paciente A (owner diferente)", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionB) }));
    const db = new FakeProposalsDb();
    db.seed({ id: "p1", admin_id: "client-A", kind: "patient_appointment_request", params_json: JSON.stringify(validAction()) });
    mockRepo(db);
    const createAppointment = vi.fn();
    vi.doMock("@/lib/repositories/appointments", () => ({ createAppointment }));

    const { POST } = await import("../app/api/portal/ai/proposals/[id]/confirm/route");
    const response = await POST(makeRequest("/api/portal/ai/proposals/p1/confirm"), { params: Promise.resolve({ id: "p1" }) });

    expect(response.status).toBe(404); // nunca revela que a proposta existe
    expect(createAppointment).not.toHaveBeenCalled();
    expect(db.statusOf("p1")).toBe("pending"); // nunca mudou de estado
  });

  it("defesa extra: mesmo se o claim (por colisao hipotetica de owner id) tivesse sucesso, uma proposta de kind diferente de patient_appointment_request nunca e executada", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    const db = new FakeProposalsDb();
    // Simula uma proposta ADMIN (kind clinico) cujo admin_id, por hipotese
    // adversarial, colide com este clientId — nunca deveria acontecer na
    // pratica (espacos de id diferentes), mas o teste garante que MESMO
    // assim nada e executado.
    db.seed({
      id: "p-admin", admin_id: "client-A", kind: "nutrition_record",
      params_json: JSON.stringify({ kind: "nutrition_record", clientId: "client-A", fields: { clinical_history: "sigiloso" }, risk: "clinical", requiresConfirmation: true }),
    });
    mockRepo(db);
    const updateNutritionRecord = vi.fn();
    vi.doMock("@/lib/repositories/nutrition-records", () => ({ updateNutritionRecord }));

    const { POST } = await import("../app/api/portal/ai/proposals/[id]/confirm/route");
    const response = await POST(makeRequest("/api/portal/ai/proposals/p-admin/confirm"), { params: Promise.resolve({ id: "p-admin" }) });

    expect(response.status).toBe(403);
    expect(updateNutritionRecord).not.toHaveBeenCalled();
    expect(db.statusOf("p-admin")).toBe("failed"); // finalizado como failed, nunca deixado "executing"
  });

  it("replay: confirmar duas vezes a mesma proposta nao cria duas consultas (idempotencia generica, reaplicada aqui)", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    const db = new FakeProposalsDb();
    db.seed({ id: "p1", admin_id: "client-A", kind: "patient_appointment_request", params_json: JSON.stringify(validAction()) });
    mockRepo(db);
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/availability", () => ({
      countFutureClientAppointments: vi.fn().mockResolvedValue(0),
      getAvailableSlots: vi.fn().mockResolvedValue([{ date: "2099-01-01", slots: ["2099-01-01T15:00:00.000Z"] }]),
      hasAppointmentConflict: vi.fn().mockResolvedValue(false),
      slotEnd: vi.fn((iso: string) => iso),
    }));
    const createAppointment = vi.fn().mockResolvedValue("appointment-1");
    vi.doMock("@/lib/repositories/appointments", () => ({ createAppointment }));

    const { POST } = await import("../app/api/portal/ai/proposals/[id]/confirm/route");
    const first = await POST(makeRequest("/api/portal/ai/proposals/p1/confirm"), { params: Promise.resolve({ id: "p1" }) });
    expect(first.status).toBe(200);

    db.claim = async (id: string, ownerId: string) => {
      const row = await db.get(id, ownerId);
      return row ? { ...row, status: "executing" } : null;
    };
    const second = await POST(makeRequest("/api/portal/ai/proposals/p1/confirm"), { params: Promise.resolve({ id: "p1" }) });
    expect(second.status).toBe(200);
    expect(createAppointment).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/portal/ai/proposals/[id]/cancel — mesma trava de kind/ownership", () => {
  it("paciente B nao cancela proposta do paciente A", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionB) }));
    const db = new FakeProposalsDb();
    db.seed({ id: "p1", admin_id: "client-A", kind: "patient_appointment_request", params_json: JSON.stringify(validAction()) });
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      cancelAiActionProposal: (id: string, ownerId: string) => db.cancel(id, ownerId),
      getAiActionProposal: (id: string, ownerId: string) => db.get(id, ownerId),
    }));
    const { POST } = await import("../app/api/portal/ai/proposals/[id]/cancel/route");
    const response = await POST(makeRequest("/api/portal/ai/proposals/p1/cancel"), { params: Promise.resolve({ id: "p1" }) });
    expect(response.status).toBe(404);
    expect(db.statusOf("p1")).toBe("pending");
  });
});
