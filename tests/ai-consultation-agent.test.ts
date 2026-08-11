import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProposedAction } from "@/lib/ai/schemas/action.schema";

/**
 * Tools e handlers do Modo Consulta (FASE 1). Cobre: calculos
 * deterministicos (compare_anthropometry — nunca a IA calcula diferenca),
 * leituras escopadas (plano/protocolo/pendencias ativos), e os 2 handlers
 * clinicos novos (consultation_tasks_batch atomico, consultation_summary
 * com guard de sessao) — reaproveitando a mesma infraestrutura de proposals
 * ja endurecida nas fases anteriores.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const ctx = { adminId: "admin-1" };

// ── tools de leitura ──────────────────────────────────────────────────────

describe("executeCompareAnthropometry — diff sempre deterministico", () => {
  it("calcula Atual/Anterior/Diferenca a partir das duas medidas mais recentes", async () => {
    vi.doMock("@/lib/repositories/client-evolutions", () => ({
      getClientEvolutions: vi.fn().mockResolvedValue([
        { measured_at: "2026-08-01", weight: 70.1, waist_cm: 82, body_fat_percentage: 28, bmi: 24.2 },
        { measured_at: "2026-07-01", weight: 71.8, waist_cm: 84, body_fat_percentage: 29, bmi: 24.8 },
      ]),
    }));
    const { executeCompareAnthropometry } = await import("@/lib/ai/agents/clinical/consultation-agent");
    const result = await executeCompareAnthropometry({ clientId: "client-1" });
    expect(result).toMatchObject({
      found: true,
      weightKg: { current: 70.1, previous: 71.8, deltaAbsolute: -1.7 },
      waistCm: { current: 82, previous: 84, deltaAbsolute: -2 },
    });
  });

  it("sem nenhuma evolucao registrada -> found:false, nunca inventa numero", async () => {
    vi.doMock("@/lib/repositories/client-evolutions", () => ({ getClientEvolutions: vi.fn().mockResolvedValue([]) }));
    const { executeCompareAnthropometry } = await import("@/lib/ai/agents/clinical/consultation-agent");
    await expect(executeCompareAnthropometry({ clientId: "client-1" })).resolves.toEqual({ found: false });
  });

  it("so uma evolucao registrada -> current preenchido, previous/delta null (nunca inventa comparacao)", async () => {
    vi.doMock("@/lib/repositories/client-evolutions", () => ({
      getClientEvolutions: vi.fn().mockResolvedValue([{ measured_at: "2026-08-01", weight: 70, waist_cm: null, body_fat_percentage: null, bmi: null }]),
    }));
    const { executeCompareAnthropometry } = await import("@/lib/ai/agents/clinical/consultation-agent");
    const result = await executeCompareAnthropometry({ clientId: "client-1" });
    expect(result).toMatchObject({ found: true, weightKg: { current: 70, previous: null, deltaAbsolute: null } });
  });
});

describe("executeGetActiveMealPlanForConsultation", () => {
  it("retorna ids reais de refeicao/item quando ha plano ativo", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({
      getActiveMealPlan: vi.fn().mockResolvedValue({
        id: "plan-1", title: "Plano", version: 3, status: "active",
        meals: [{ id: "meal-1", name: "Almoço", suggested_time: "12:00", items: [{ id: "item-1", food: "Arroz", quantity: "100", unit: "g" }] }],
      }),
    }));
    const { executeGetActiveMealPlanForConsultation } = await import("@/lib/ai/agents/clinical/consultation-agent");
    const result = await executeGetActiveMealPlanForConsultation({ clientId: "client-1" });
    expect(result).toMatchObject({ found: true, mealPlanId: "plan-1", version: 3 });
    if (result.found) {
      expect(result.meals[0]).toMatchObject({ mealId: "meal-1", items: [{ itemId: "item-1", food: "Arroz" }] });
    }
  });

  it("sem plano ativo -> found:false", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(null) }));
    const { executeGetActiveMealPlanForConsultation } = await import("@/lib/ai/agents/clinical/consultation-agent");
    await expect(executeGetActiveMealPlanForConsultation({ clientId: "client-1" })).resolves.toEqual({ found: false });
  });
});

describe("executeGetActiveProtocolForConsultation", () => {
  it("so considera status ativo/pausado, ignora concluido/cancelado", async () => {
    vi.doMock("@/lib/repositories/client-protocols", () => ({
      getClientProtocols: vi.fn().mockResolvedValue([
        { id: "cp-old", status: "concluido", protocol_title: "Antigo" },
        { id: "cp-1", status: "pausado", protocol_title: "Atual", phase_count: 2, task_count: 4, completed_task_count: 1 },
      ]),
    }));
    const { executeGetActiveProtocolForConsultation } = await import("@/lib/ai/agents/clinical/consultation-agent");
    const result = await executeGetActiveProtocolForConsultation({ clientId: "client-1" });
    expect(result).toMatchObject({ found: true, clientProtocolId: "cp-1", title: "Atual" });
  });

  it("sem protocolo ativo/pausado -> found:false", async () => {
    vi.doMock("@/lib/repositories/client-protocols", () => ({ getClientProtocols: vi.fn().mockResolvedValue([]) }));
    const { executeGetActiveProtocolForConsultation } = await import("@/lib/ai/agents/clinical/consultation-agent");
    await expect(executeGetActiveProtocolForConsultation({ clientId: "client-1" })).resolves.toEqual({ found: false });
  });
});

describe("executeGetPendingPatientItems", () => {
  it("combina tarefas pendentes e solicitacoes aguardando revisao, nunca notas internas", async () => {
    vi.doMock("@/lib/repositories/client-tasks", () => ({
      getClientTasks: vi.fn().mockResolvedValue([{ id: "task-1", title: "Beber água", due_date: "2026-08-20" }]),
      createClientTasksBatch: vi.fn(),
    }));
    vi.doMock("@/lib/repositories/patient-requests", () => ({
      listPatientRequests: vi.fn().mockResolvedValue([{ id: "req-1", request_type: "food_substitution", ai_summary: null, patient_text: "Trocar banana", admin_notes: "nota interna sigilosa" }]),
    }));
    const { executeGetPendingPatientItems } = await import("@/lib/ai/agents/clinical/consultation-agent");
    const result = await executeGetPendingPatientItems({ clientId: "client-1" });
    expect(result.tasks).toEqual([{ taskId: "task-1", title: "Beber água", dueDate: "2026-08-20" }]);
    expect(result.patientRequests).toEqual([{ requestId: "req-1", requestType: "food_substitution", summary: "Trocar banana" }]);
    expect(JSON.stringify(result)).not.toContain("nota interna sigilosa");
  });
});

// ── handlers clinicos ─────────────────────────────────────────────────────

function tasksBatchAction(overrides: Partial<ProposedAction> = {}): ProposedAction {
  return {
    kind: "consultation_tasks_batch", clientId: "client-1", consultationSessionId: "session-1",
    tasks: [{ title: "Beber mais água", description: null, dueInDays: 7 }],
    risk: "sensitive", requiresConfirmation: true,
    ...overrides,
  } as ProposedAction;
}

function summaryAction(overrides: Partial<ProposedAction> = {}): ProposedAction {
  return {
    kind: "consultation_summary", clientId: "client-1", consultationSessionId: "session-1",
    content: { summary: "Consulta tranquila, manteve adesão." },
    risk: "clinical", requiresConfirmation: true,
    ...overrides,
  } as ProposedAction;
}

describe("executeProposedAction — consultation_tasks_batch (atomicidade + IDOR)", () => {
  it("cria todas as tarefas numa unica chamada atomica (d1Batch)", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({
      getConsultationSessionById: vi.fn().mockResolvedValue({ id: "session-1", client_id: "client-1", status: "in_progress" }),
    }));
    const createClientTasksBatch = vi.fn().mockResolvedValue(["task-a", "task-b"]);
    vi.doMock("@/lib/repositories/client-tasks", () => ({ createClientTasksBatch }));

    const { executeProposedAction } = await import("@/lib/ai/core/proposal-handlers");
    const result = await executeProposedAction(tasksBatchAction({
      tasks: [{ title: "Tarefa 1", description: null, dueInDays: 3 }, { title: "Tarefa 2", description: null, dueInDays: 10 }],
    } as never), ctx);

    expect(createClientTasksBatch).toHaveBeenCalledTimes(1);
    expect(createClientTasksBatch).toHaveBeenCalledWith("client-1", expect.arrayContaining([
      expect.objectContaining({ title: "Tarefa 1" }),
      expect.objectContaining({ title: "Tarefa 2" }),
    ]));
    expect(result.data).toEqual({ taskIds: ["task-a", "task-b"], taskCount: 2 });
  });

  it("rejeita quando a sessao de consulta pertence a outro paciente (IDOR)", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({
      getConsultationSessionById: vi.fn().mockResolvedValue({ id: "session-1", client_id: "OUTRO-CLIENTE", status: "in_progress" }),
    }));
    const createClientTasksBatch = vi.fn();
    vi.doMock("@/lib/repositories/client-tasks", () => ({ createClientTasksBatch }));

    const { executeProposedAction, ProposalExecutionError } = await import("@/lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(tasksBatchAction(), ctx)).rejects.toBeInstanceOf(ProposalExecutionError);
    expect(createClientTasksBatch).not.toHaveBeenCalled();
  });

  it("funciona mesmo sem consultationSessionId (tarefas fora do Modo Consulta continuam validas)", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const getConsultationSessionById = vi.fn();
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({ getConsultationSessionById }));
    const createClientTasksBatch = vi.fn().mockResolvedValue(["task-a"]);
    vi.doMock("@/lib/repositories/client-tasks", () => ({ createClientTasksBatch }));

    const { executeProposedAction } = await import("@/lib/ai/core/proposal-handlers");
    await executeProposedAction(tasksBatchAction({ consultationSessionId: null } as never), ctx);
    expect(getConsultationSessionById).not.toHaveBeenCalled();
    expect(createClientTasksBatch).toHaveBeenCalledTimes(1);
  });
});

describe("executeProposedAction — consultation_summary (guard de sessao + IDOR)", () => {
  it("grava o resumo na sessao (unico side effect — nunca toca prontuario/plano)", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({
      getConsultationSessionById: vi.fn().mockResolvedValue({ id: "session-1", client_id: "client-1", status: "in_progress" }),
      saveConsultationSummary: vi.fn().mockResolvedValue(true),
    }));
    const updateNutritionRecord = vi.fn();
    vi.doMock("@/lib/repositories/nutrition-records", () => ({ updateNutritionRecord }));
    const updateMealPlan = vi.fn();
    vi.doMock("@/lib/repositories/meal-plans", () => ({ updateMealPlan, getActiveMealPlan: vi.fn(), getMealPlanById: vi.fn() }));

    const { executeProposedAction } = await import("@/lib/ai/core/proposal-handlers");
    const result = await executeProposedAction(summaryAction(), ctx);
    expect(result.data).toEqual({ consultationSessionId: "session-1" });
    expect(updateNutritionRecord).not.toHaveBeenCalled();
    expect(updateMealPlan).not.toHaveBeenCalled();
  });

  it("rejeita quando a sessao ja foi finalizada/cancelada (nao esta mais in_progress)", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({
      getConsultationSessionById: vi.fn().mockResolvedValue({ id: "session-1", client_id: "client-1", status: "in_progress" }),
      saveConsultationSummary: vi.fn().mockResolvedValue(false), // repo ja recusou pois status != in_progress
    }));
    const { executeProposedAction, ProposalExecutionError } = await import("@/lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(summaryAction(), ctx)).rejects.toBeInstanceOf(ProposalExecutionError);
  });

  it("rejeita quando a sessao pertence a outro paciente (IDOR)", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const saveConsultationSummary = vi.fn();
    vi.doMock("@/lib/repositories/consultation-sessions", () => ({
      getConsultationSessionById: vi.fn().mockResolvedValue({ id: "session-1", client_id: "OUTRO-CLIENTE", status: "in_progress" }),
      saveConsultationSummary,
    }));
    const { executeProposedAction, ProposalExecutionError } = await import("@/lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(summaryAction(), ctx)).rejects.toBeInstanceOf(ProposalExecutionError);
    expect(saveConsultationSummary).not.toHaveBeenCalled();
  });
});
