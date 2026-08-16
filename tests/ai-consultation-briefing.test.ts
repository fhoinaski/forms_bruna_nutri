import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Briefing do Modo Consulta — systemData 100% deterministico (nunca a IA
 * calcula peso/IMC/variacao), aiBrief so interpreta o que ja foi calculado,
 * e falha graciosamente (nunca quebra o briefing inteiro) se a IA nao
 * estiver configurada ou o provider cair.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const client = { id: "client-1", name: "Maria Silva" } as import("@/lib/repositories/clients").Client;

function mockRepos(overrides: {
  evolutions?: unknown[];
  tasks?: unknown[];
  mealPlan?: unknown;
  appointments?: unknown[];
  protocols?: unknown[];
  patientRequests?: unknown[];
}) {
  vi.doMock("@/lib/repositories/client-evolutions", () => ({ getClientEvolutions: vi.fn().mockResolvedValue(overrides.evolutions ?? []) }));
  vi.doMock("@/lib/repositories/client-tasks", () => ({ getClientTasks: vi.fn().mockResolvedValue(overrides.tasks ?? []) }));
  vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(overrides.mealPlan ?? null) }));
  vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments: vi.fn().mockResolvedValue(overrides.appointments ?? []) }));
  vi.doMock("@/lib/repositories/client-protocols", () => ({ getClientProtocols: vi.fn().mockResolvedValue(overrides.protocols ?? []) }));
  vi.doMock("@/lib/repositories/patient-requests", () => ({ listPatientRequests: vi.fn().mockResolvedValue(overrides.patientRequests ?? []) }));
  vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({ listPatientClinicalMarkers: vi.fn().mockResolvedValue([]) }));
  vi.doMock("@/lib/repositories/patient-food-substitution-events", () => ({ listRecentPatientFoodSubstitutionEvents: vi.fn().mockResolvedValue([]) }));
}

describe("buildConsultationSystemData — 100% deterministico", () => {
  it("calcula variacao de peso a partir das duas evolucoes mais recentes, nunca via IA", async () => {
    mockRepos({
      evolutions: [
        { measured_at: "2026-08-01", weight: 70.1, bmi: 24.2, waist_cm: 82, body_fat_percentage: 28, adherence_score: 7, symptoms: null, progress_notes: null, conduct_notes: "Manter conduta" },
        { measured_at: "2026-07-01", weight: 71.8, bmi: 24.8, waist_cm: 84, body_fat_percentage: 29, adherence_score: 6, symptoms: "Fome noturna", progress_notes: null, conduct_notes: null },
      ],
    });
    const { buildConsultationSystemData } = await import("@/lib/ai/agents/clinical/consultation-briefing");
    const data = await buildConsultationSystemData(client);
    expect(data.evolution.currentWeightKg).toBe(70.1);
    expect(data.evolution.previousWeightKg).toBe(71.8);
    expect(data.evolution.weightDeltaKg).toBe(-1.7);
    expect(data.lastVisit.conductNotes).toBe("Manter conduta");
  });

  it("sem evolucao/plano/protocolo — tudo null, nunca lanca erro", async () => {
    mockRepos({});
    const { buildConsultationSystemData } = await import("@/lib/ai/agents/clinical/consultation-briefing");
    const data = await buildConsultationSystemData(client);
    expect(data.evolution.currentWeightKg).toBeNull();
    expect(data.evolution.weightDeltaKg).toBeNull();
    expect(data.activePlan.title).toBeNull();
    expect(data.activeProtocol).toBeNull();
  });

  it("so considera protocolo com status ativo, ignora pausado/concluido", async () => {
    mockRepos({
      protocols: [
        { status: "pausado", protocol_title: "Antigo" },
        { status: "ativo", protocol_title: "Atual", phase_count: 3, task_count: 5, completed_task_count: 2 },
      ],
    });
    const { buildConsultationSystemData } = await import("@/lib/ai/agents/clinical/consultation-briefing");
    const data = await buildConsultationSystemData(client);
    expect(data.activeProtocol?.title).toBe("Atual");
    expect(data.activeProtocol?.completedTaskCount).toBe(2);
  });
});

describe("generateConsultationAiBrief — falha graciosa (systemData sozinho continua util)", () => {
  it("retorna null quando a IA nao esta configurada, nunca lanca", async () => {
    mockRepos({});
    const { AiConfigError } = await import("@/lib/ai/core/ai-errors");
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockRejectedValue(new AiConfigError("sem chave")),
    }));
    const { buildConsultationSystemData, generateConsultationAiBrief } = await import("@/lib/ai/agents/clinical/consultation-briefing");
    const data = await buildConsultationSystemData(client);
    await expect(generateConsultationAiBrief(client, data)).resolves.toBeNull();
  });

  it("retorna o brief validado quando a IA responde no formato esperado", async () => {
    mockRepos({});
    const brief = {
      clinicalSummary: "Paciente estavel.",
      changesSinceLastVisit: ["Peso estavel"],
      attentionPoints: [],
      pendingItems: [],
      suggestedTopics: ["Revisar adesao"],
      missingData: [],
    };
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({ generateStructuredResult: vi.fn().mockResolvedValue({ data: brief, provider: "openai", model: "gpt-4o", attempts: 1, repaired: false }) }));
    const { buildConsultationSystemData, generateConsultationAiBrief } = await import("@/lib/ai/agents/clinical/consultation-briefing");
    const data = await buildConsultationSystemData(client);
    await expect(generateConsultationAiBrief(client, data)).resolves.toEqual(brief);
  });

  it("propaga erros inesperados (nao de config/provider/validacao) em vez de mascarar", async () => {
    mockRepos({});
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({ generateStructuredResult: vi.fn().mockRejectedValue(new Error("bug interno inesperado")) }));
    const { buildConsultationSystemData, generateConsultationAiBrief } = await import("@/lib/ai/agents/clinical/consultation-briefing");
    const data = await buildConsultationSystemData(client);
    await expect(generateConsultationAiBrief(client, data)).rejects.toThrow("bug interno inesperado");
  });
});

describe("consultationAiBriefSchema", () => {
  it("aceita o formato completo com as 6 secoes", async () => {
    const { consultationAiBriefSchema } = await import("@/lib/ai/agents/clinical/consultation-briefing");
    const result = consultationAiBriefSchema.safeParse({
      clinicalSummary: "x", changesSinceLastVisit: [], attentionPoints: [], pendingItems: [], suggestedTopics: [], missingData: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita mais de 6 itens numa lista (nunca uma lista sem limite)", async () => {
    const { consultationAiBriefSchema } = await import("@/lib/ai/agents/clinical/consultation-briefing");
    const result = consultationAiBriefSchema.safeParse({
      clinicalSummary: "x",
      changesSinceLastVisit: Array.from({ length: 7 }, (_, i) => `item ${i}`),
      attentionPoints: [], pendingItems: [], suggestedTopics: [], missingData: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita campo faltante", async () => {
    const { consultationAiBriefSchema } = await import("@/lib/ai/agents/clinical/consultation-briefing");
    const result = consultationAiBriefSchema.safeParse({ clinicalSummary: "x" });
    expect(result.success).toBe(false);
  });
});
