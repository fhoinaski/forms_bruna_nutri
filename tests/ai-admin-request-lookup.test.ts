import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * FASE 1B — complemento de solicitacoes/propostas para o admin
 * (getPatientRequestDetails, getPendingAiProposals) em
 * lib/ai/agents/clients/patient-requests-agent.ts.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("executeGetPatientRequestDetails", () => {
  it("found:false para id inexistente", async () => {
    vi.doMock("@/lib/repositories/patient-requests", () => ({ getPatientRequestById: vi.fn().mockResolvedValue(null) }));
    const { executeGetPatientRequestDetails } = await import("../lib/ai/agents/clients/patient-requests-agent");
    const result = await executeGetPatientRequestDetails({ requestId: "does-not-exist" });
    expect(result).toEqual({ found: false });
  });

  it("devolve o detalhe completo com o nome do cliente resolvido", async () => {
    vi.doMock("@/lib/repositories/patient-requests", () => ({
      getPatientRequestById: vi.fn().mockResolvedValue({
        id: "req-1", client_id: "client-1", request_type: "food_substitution", patient_text: "Trocar arroz por batata",
        ai_summary: "Pedido de substituição", meal_plan_id: "plan-1", meal_id: "meal-1", item_id: "item-1",
        appointment_id: null, client_task_id: null, status: "pending_review", admin_notes: null,
        reviewed_at: null, created_at: "now", updated_at: "now",
      }),
    }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria Silva" }) }));
    const { executeGetPatientRequestDetails } = await import("../lib/ai/agents/clients/patient-requests-agent");
    const result = await executeGetPatientRequestDetails({ requestId: "req-1" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.request.clientName).toBe("Maria Silva");
    expect(result.request.status).toBe("pending_review");
  });
});

describe("executeGetPendingAiProposals", () => {
  it("filtra so os itens do dashboard do tipo AI_PROPOSAL_PENDING/AI_PROPOSAL_REVIEW — reaproveita o mesmo feed, nunca uma query nova", async () => {
    vi.doMock("@/lib/dashboard/action-items", () => ({
      getDashboardActionItems: vi.fn().mockResolvedValue([
        { id: "ai-proposal:p1", type: "AI_PROPOSAL_PENDING", priority: "NORMAL", section: "ATTENTION", title: "Proposta", subject: "Maria", description: "agendamento - risco sensitive.", source: "ai_action_proposals", sourceId: "p1", href: "/dashboard/clients/client-1", actionLabel: "Abrir contexto", dueAt: "now", occurredAt: null, createdAt: "now" },
        { id: "appointment-now:apt1", type: "APPOINTMENT_NOW", priority: "URGENT", section: "NOW", title: "x", subject: "y", description: "z", source: "appointments", sourceId: "apt1", href: "/x", actionLabel: "x", dueAt: "now", occurredAt: null, createdAt: null },
      ]),
    }));
    const { executeGetPendingAiProposals } = await import("../lib/ai/agents/clients/patient-requests-agent");
    const result = await executeGetPendingAiProposals();
    expect(result.totalFound).toBe(1);
    expect(result.proposals[0]).toMatchObject({ id: "p1", status: "pending", subject: "Maria" });
  });

  it("sem nenhuma proposta pendente, devolve lista vazia — nunca inventa uma", async () => {
    vi.doMock("@/lib/dashboard/action-items", () => ({ getDashboardActionItems: vi.fn().mockResolvedValue([]) }));
    const { executeGetPendingAiProposals } = await import("../lib/ai/agents/clients/patient-requests-agent");
    const result = await executeGetPendingAiProposals();
    expect(result).toEqual({ proposals: [], totalFound: 0 });
  });
});
