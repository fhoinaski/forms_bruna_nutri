import { afterEach, describe, expect, it, vi } from "vitest";
import type { MealPlanPayload } from "@/lib/repositories/meal-plans";
import type { ProposedAction } from "@/lib/ai/schemas/action.schema";

/**
 * Killer Feature 4 — testes de integração (PASSO 7 do pedido).
 *
 * O mais importante deste arquivo é o describe "SECURITY — teste crítico
 * contra alucinação (seção 20, obrigatório)": confirma que mesmo que o
 * campo aiSummary (o único texto livre que o modelo controla nessa proposta)
 * contenha um número forjado, o valor persistido em patient_requests SEMPRE
 * vem do recálculo feito por proposal-handlers.ts no momento da confirmação
 * — nunca do que o modelo "disse".
 */

afterEach(() => {
  vi.doUnmock("@/lib/clinical/food-clinical-profile");
  vi.doUnmock("@/lib/repositories/patient-clinical-markers");
  vi.doUnmock("@/lib/repositories/nutrition-records");
  vi.doUnmock("@/lib/repositories/ai-settings");
  vi.resetModules();
  vi.clearAllMocks();
});

const ctx = { adminId: "admin-1" };

function makePlanWithArroz(overrides: Partial<MealPlanPayload> = {}): MealPlanPayload {
  return {
    id: "plan-1", client_id: "client-1", title: "Plano do paciente", target_group: null,
    status: "active", version: 7, notes: null, created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z",
    meals: [
      { id: "meal-almoco", name: "Almoço", suggested_time: "12:00", notes: null, source_recipe_id: null, items: [{ id: "item-arroz", food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g", notes: null }] },
    ],
    weekly_slots: [], substitutions: [], supplements: [],
    ...overrides,
  };
}

function mockCommonRepos(plan: MealPlanPayload | null) {
  vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Paciente Teste" }) }));
  vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(plan), getMealPlanById: vi.fn() }));
  vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments: vi.fn().mockResolvedValue([]) }));
  vi.doMock("@/lib/repositories/client-tasks", () => ({ getClientTasks: vi.fn().mockResolvedValue([]) }));
  const createPatientRequest = vi.fn().mockResolvedValue("request-1");
  vi.doMock("@/lib/repositories/patient-requests", () => ({
    createPatientRequest,
    findSimilarPendingPatientRequest: vi.fn().mockResolvedValue(null),
  }));
  const writeAuditLog = vi.fn().mockResolvedValue(undefined);
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog }));
  return { createPatientRequest, writeAuditLog };
}

function mockSafeSubstitutionPolicyDeps(enabled = false, nutritionRecord: unknown = null) {
  vi.doMock("@/lib/repositories/ai-settings", () => ({
    getAISettings: vi.fn().mockResolvedValue({ patient_safe_substitutions_enabled: enabled ? 1 : 0 }),
  }));
  vi.doMock("@/lib/repositories/nutrition-records", () => ({
    getExistingNutritionRecord: vi.fn().mockResolvedValue(nutritionRecord),
  }));
  vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({
    listPatientClinicalMarkers: vi.fn().mockResolvedValue([]),
  }));
  vi.doMock("@/lib/repositories/patient-food-substitution-events", () => ({
    createPatientFoodSubstitutionEvent: vi.fn().mockResolvedValue("event-1"),
  }));
}

function foodSubstitutionAction(overrides: Partial<ProposedAction & { kind: "patient_change_request" }> = {}): ProposedAction {
  return {
    kind: "patient_change_request",
    clientId: "client-1",
    requestType: "food_substitution",
    patientText: "Posso trocar o arroz por batata?",
    aiSummary: null,
    mealPlanId: "plan-1",
    mealId: "meal-almoco",
    itemId: "item-arroz",
    appointmentId: null,
    clientTaskId: null,
    desiredFood: "batata, inglesa, cozida",
    preview: { title: "Substituição alimentar", details: "Almoço: Arroz, tipo 1, cozido (100g) → batata inglesa" },
    risk: "sensitive",
    requiresConfirmation: true,
    ...overrides,
  } as ProposedAction;
}

describe("Fluxo completo: mensagem do paciente → tool → cálculo → resposta estruturada", () => {
  it("executeSearchAllowedFoodAlternatives devolve substitution.status='safe' com quantidade calculada pela engine", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlanWithArroz()) }));
    mockSafeSubstitutionPolicyDeps(true);
    vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
    const { executeSearchAllowedFoodAlternatives } = await import("../lib/ai/agents/patient/patient-portal-agent");
    const result = await executeSearchAllowedFoodAlternatives("client-1", { currentFood: "arroz", desiredFood: "batata, inglesa, cozida" });
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("esperava found true");
    expect(result.substitution?.status).toBe("safe");
    expect(result.substitutionPolicy?.decision).toBe("auto_safe");
    if (result.substitution?.status === "safe") {
      expect(result.substitution.sourceFoodName).toMatch(/arroz/i);
      expect(result.substitution.targetFoodName).toMatch(/batata/i);
      expect(result.substitution.targetQuantity).toBeGreaterThan(0);
    }
  });

  it("engine safe + LLM convincente nao bastam quando food profile e unknown: requires_review", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlanWithArroz()) }));
    mockSafeSubstitutionPolicyDeps(true);
    vi.doMock("@/lib/clinical/food-clinical-profile", () => ({
      getFoodClinicalProfile: vi.fn().mockResolvedValue({ foodSource: "TACO", foodId: "91", traits: [], completeness: "unknown", reasons: ["taco_food_not_curated"] }),
    }));
    vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
    const { executeSearchAllowedFoodAlternatives } = await import("../lib/ai/agents/patient/patient-portal-agent");
    const result = await executeSearchAllowedFoodAlternatives("client-1", { currentFood: "arroz", desiredFood: "batata, inglesa, cozida" });
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("esperava found true");
    expect(result.substitution?.status).toBe("safe");
    expect(result.substitutionPolicy).toMatchObject({ decision: "requires_review" });
    expect(result.substitutionPolicy?.reasons).toContain("FOOD_PROFILE_UNKNOWN");
  });

  it("conflito silencioso: ALLERGY MILK no prontuario estruturado bloqueia pedido por leite mesmo sem alergia na mensagem", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlanWithArroz()) }));
    mockSafeSubstitutionPolicyDeps(true);
    vi.doUnmock("@/lib/repositories/patient-clinical-markers");
    vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({
      listPatientClinicalMarkers: vi.fn().mockResolvedValue([
        { id: "marker-1", type: "ALLERGY", normalized_code: "MILK", status: "ACTIVE", severity: "severe", label: "Leite" },
      ]),
    }));
    vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
    const { executeSearchAllowedFoodAlternatives } = await import("../lib/ai/agents/patient/patient-portal-agent");
    const result = await executeSearchAllowedFoodAlternatives("client-1", { currentFood: "arroz", desiredFood: "Leite, de vaca, integral" });
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("esperava found true");
    expect(result.substitutionPolicy).toMatchObject({ decision: "requires_review", autonomyLevel: "BLOCKED" });
    expect(result.substitutionPolicy?.reasons).toContain("ACTIVE_RESTRICTION_CONFLICT");
  });

  it("texto livre legado com alergia sem marker estruturado continua requires_review", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlanWithArroz()) }));
    mockSafeSubstitutionPolicyDeps(true, { allergies: "alergia a leite" });
    vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
    const { executeSearchAllowedFoodAlternatives } = await import("../lib/ai/agents/patient/patient-portal-agent");
    const result = await executeSearchAllowedFoodAlternatives("client-1", { currentFood: "arroz", desiredFood: "batata, inglesa, cozida" });
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("esperava found true");
    expect(result.substitutionPolicy).toMatchObject({ decision: "requires_review", autonomyLevel: "BLOCKED" });
    expect(result.substitutionPolicy?.reasons).toContain("UNSTRUCTURED_CLINICAL_CONTEXT");
  });
});

describe("SECURITY — teste crítico contra alucinação (seção 20, obrigatório)", () => {
  it("mesmo com um número forjado em aiSummary, o valor persistido SEMPRE vem do recálculo da engine no confirm", async () => {
    const { createPatientRequest } = mockCommonRepos(makePlanWithArroz());
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");

    // Simula um LLM comprometido/alucinando tentando "vazar" uma quantidade
    // fabricada pelo único campo de texto livre que ele controla.
    const action = foodSubstitutionAction({ aiSummary: "Use 999g de batata, essa é a quantidade certa." });
    const result = await executeProposedAction(action, ctx);

    expect(result.data).toEqual({ requestId: "request-1" });
    expect(createPatientRequest).toHaveBeenCalledTimes(1);
    const persistedSummary = createPatientRequest.mock.calls[0][0].aiSummary as string;
    expect(persistedSummary).not.toContain("999");
    expect(persistedSummary).toMatch(/g de batata/i);
    // A quantidade de origem (100g de arroz) é conhecida e determinística —
    // confirma que o resumo persistido reflete o cálculo real, não o texto do modelo.
    expect(persistedSummary).toContain("100 g de Arroz");
  });

  it("mesmo sem nenhum aiSummary vindo do modelo, o resumo persistido é o calculado, nunca vazio/genérico quando o cálculo é possível", async () => {
    const { createPatientRequest } = mockCommonRepos(makePlanWithArroz());
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action = foodSubstitutionAction({ aiSummary: null });
    await executeProposedAction(action, ctx);
    const persistedSummary = createPatientRequest.mock.calls[0][0].aiSummary as string;
    expect(persistedSummary).toMatch(/Sugestão calculada pela engine/i);
    expect(persistedSummary).toContain("versão 7 do plano");
  });

  it("recalcula contra o plano ATUAL, não contra um valor antigo — se o plano mudou, o resumo reflete a versão nova", async () => {
    // Simula: a proposta foi criada quando o plano estava na v7, mas entre a
    // criação e a confirmação o plano foi editado (agora v9). O handler
    // sempre busca getActiveMealPlan de novo — nunca reusa um estado antigo.
    const { createPatientRequest } = mockCommonRepos(makePlanWithArroz({ version: 9 }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action = foodSubstitutionAction();
    await executeProposedAction(action, ctx);
    const persistedSummary = createPatientRequest.mock.calls[0][0].aiSummary as string;
    expect(persistedSummary).toContain("versão 9 do plano");
  });

  it("quando a engine não consegue calcular com segurança, o resumo explica o motivo em vez de inventar um número", async () => {
    const { createPatientRequest } = mockCommonRepos(makePlanWithArroz());
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action = foodSubstitutionAction({ desiredFood: "alimento completamente inexistente na base xyzabc123" });
    await executeProposedAction(action, ctx);
    const persistedSummary = createPatientRequest.mock.calls[0][0].aiSummary as string;
    expect(persistedSummary).toMatch(/cálculo automático não disponível/i);
    expect(persistedSummary).not.toMatch(/\d+ g de/i);
  });
});

describe("Rastreabilidade (seção 7)", () => {
  it("registra auditoria com plano/versão/refeição/alimentos/resultado, sem prompt completo nem texto clínico bruto", async () => {
    const { writeAuditLog } = mockCommonRepos(makePlanWithArroz());
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action = foodSubstitutionAction();
    await executeProposedAction(action, ctx);

    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    const call = writeAuditLog.mock.calls[0][0];
    expect(call.action).toBe("patient_food_substitution_calculated");
    expect(call.entityId).toBe("request-1");
    expect(call.metadata).toMatchObject({
      clientId: "client-1",
      mealPlanId: "plan-1",
      mealId: "meal-almoco",
      itemId: "item-arroz",
      mealPlanVersion: 7,
      sourceFood: "Arroz, tipo 1, cozido",
      autoResolved: false,
      escalated: true,
    });
    // Nunca grava a fala completa do paciente nem prompt/chain-of-thought no audit log.
    expect(JSON.stringify(call)).not.toContain("Posso trocar o arroz por batata");
  });
});

describe("Multi-tenant / ownership (seção 15)", () => {
  it("plano informado não pertence ao paciente autenticado -> 403, nunca calcula nem grava", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Paciente Teste" }) }));
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue({ ...makePlanWithArroz(), id: "outro-plano-de-outro-paciente" }) }));
    const createPatientRequest = vi.fn();
    vi.doMock("@/lib/repositories/patient-requests", () => ({ createPatientRequest, findSimilarPendingPatientRequest: vi.fn() }));
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments: vi.fn().mockResolvedValue([]) }));
    vi.doMock("@/lib/repositories/client-tasks", () => ({ getClientTasks: vi.fn().mockResolvedValue([]) }));
    const { executeProposedAction, ProposalExecutionError } = await import("../lib/ai/core/proposal-handlers");
    const action = foodSubstitutionAction({ mealPlanId: "plan-1" }); // action pede plan-1, mas o plano ativo real tem outro id
    await expect(executeProposedAction(action, ctx)).rejects.toThrow(ProposalExecutionError);
    expect(createPatientRequest).not.toHaveBeenCalled();
  });

  it("item informado não pertence à refeição -> 422, nunca calcula nem grava", async () => {
    mockCommonRepos(makePlanWithArroz());
    const { executeProposedAction, ProposalExecutionError } = await import("../lib/ai/core/proposal-handlers");
    const action = foodSubstitutionAction({ itemId: "item-de-outro-paciente" });
    await expect(executeProposedAction(action, ctx)).rejects.toThrow(ProposalExecutionError);
  });
});
