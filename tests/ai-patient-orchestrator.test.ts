import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientPortalSession } from "@/lib/auth/client-portal-session";

/**
 * Secao 17/18/42/43 do pedido: allow-list de tools do PATIENT_ASSISTANT e
 * enforcement server-side — nao basta "esconder na UI", a tool
 * administrativa/clinica nunca pode chegar ao ToolSet que vai para o
 * modelo. Secao 4/44: o clientId do contexto do paciente vem SEMPRE da
 * sessao, nunca de um campo arbitrario.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("resolvePatientTools — allow-list real (nao so cosmetica)", () => {
  it("o ToolSet do paciente contem exatamente as tools do perfil PATIENT_ASSISTANT", async () => {
    const { resolvePatientTools } = await import("../lib/ai/core/patient-orchestrator");
    const tools = resolvePatientTools("client-1");
    expect(Object.keys(tools).sort()).toEqual([
      "getAvailableSlotsForScheduling",
      "getMyAppointments",
      "getMyMealDetails",
      "getMyMealPlan",
      "getMyRequests",
      "getMyTasks",
      "navigatePatientPortal",
      "requestAppointment",
      "requestProfessionalReview",
      "searchAllowedFoodAlternatives",
    ].sort());
  });

  it("NUNCA inclui nenhuma tool administrativa/clinica, mesmo elas existindo no registro central (secao 17/42/43)", async () => {
    const { resolvePatientTools } = await import("../lib/ai/core/patient-orchestrator");
    const { PROPOSE_NUTRITION_RECORD_TOOL_NAME } = await import("../lib/ai/agents/clinical/prontuario-agent");
    const { PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const { LIST_OPPORTUNITIES_TOOL_NAME, GET_SYSTEM_OVERVIEW_TOOL_NAME } = await import("../lib/ai/agents/system/system-overview-agent");
    const { PROPOSE_NEW_PROTOCOL_TOOL_NAME } = await import("../lib/ai/agents/clinical/protocol-creation-agent");
    const { NAVIGATE_TOOL_NAME } = await import("../lib/ai/agents/navigation/navigation-agent");

    const tools = resolvePatientTools("client-1");
    const toolNames = Object.keys(tools);

    for (const forbidden of [
      PROPOSE_NUTRITION_RECORD_TOOL_NAME,
      PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME,
      LIST_OPPORTUNITIES_TOOL_NAME,
      GET_SYSTEM_OVERVIEW_TOOL_NAME,
      PROPOSE_NEW_PROTOCOL_TOOL_NAME,
      NAVIGATE_TOOL_NAME, // navegacao ADMIN — nao a do paciente (nomes diferentes de proposito)
    ]) {
      expect(toolNames).not.toContain(forbidden);
    }
  });

  it("as tools de leitura vinculadas a identidade (plano/consultas/tarefas/alimentos) so retornam dados do clientId passado — a mesma definicao de tool nunca recebe clientId do modelo", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({
      getActiveMealPlan: vi.fn(async (clientId: string) => (clientId === "client-A" ? { title: "Plano A", meals: [] } : null)),
    }));
    const { resolvePatientTools } = await import("../lib/ai/core/patient-orchestrator");

    const toolsForA = resolvePatientTools("client-A");
    const resultForA = await (toolsForA.getMyMealPlan.execute as (input: unknown) => Promise<unknown>)({});
    expect(resultForA).toMatchObject({ found: true, mealPlanTitle: "Plano A" });

    const toolsForB = resolvePatientTools("client-B");
    const resultForB = await (toolsForB.getMyMealPlan.execute as (input: unknown) => Promise<unknown>)({});
    expect(resultForB).toEqual({ found: false });
  });

  it("apenas requestAppointment (risco sensitive) para o loop — as demais sao read/low e nunca interrompem a cadeia", async () => {
    const patientOrchestrator = await import("../lib/ai/core/patient-orchestrator");
    // sameToolRepeatedTooOften/stopWhen usam PATIENT_SENSITIVE_TOOL_NAMES internamente;
    // testamos indiretamente via getToolRisk, que e a mesma fonte central usada.
    const { getToolRisk } = await import("../lib/ai/tools/registry");
    const { REQUEST_APPOINTMENT_TOOL_NAME } = await import("../lib/ai/agents/patient/patient-scheduling-agent");
    const { GET_MY_MEAL_PLAN_TOOL_NAME } = await import("../lib/ai/agents/patient/patient-portal-agent");
    expect(getToolRisk(REQUEST_APPOINTMENT_TOOL_NAME)).toBe("sensitive");
    expect(getToolRisk(GET_MY_MEAL_PLAN_TOOL_NAME)).toBe("read");
    void patientOrchestrator;
  });
});

describe("resolvePatientTools — Killer Feature 4, Nivel 3 (guardrail estrutural, nao so de prompt)", () => {
  it("excludeSubstitutionTool remove searchAllowedFoodAlternatives do ToolSet, mantendo as demais", async () => {
    const { resolvePatientTools } = await import("../lib/ai/core/patient-orchestrator");
    const tools = resolvePatientTools("client-1", { excludeSubstitutionTool: true });
    const toolNames = Object.keys(tools);
    expect(toolNames).not.toContain("searchAllowedFoodAlternatives");
    expect(toolNames).toContain("getMyMealPlan");
    expect(toolNames).toContain("requestProfessionalReview");
  });

  it("sem a opcao (comportamento padrao), searchAllowedFoodAlternatives continua disponivel", async () => {
    const { resolvePatientTools } = await import("../lib/ai/core/patient-orchestrator");
    expect(Object.keys(resolvePatientTools("client-1"))).toContain("searchAllowedFoodAlternatives");
  });
});

describe("runPatientAssistantTurn — sinal clínico remove a tool de substituição do turno (Killer Feature 4, Nível 3)", () => {
  function mockMemoryAndCapture() {
    vi.doMock("@/lib/ai/memory/patient-conversation-summary", () => ({
      getPatientConversationMemory: vi.fn().mockResolvedValue(null),
      recordPatientConversationTurn: vi.fn().mockResolvedValue(undefined),
    }));
    let capturedTools: Record<string, unknown> = {};
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generate: vi.fn(async (options: { tools: Record<string, unknown> }) => {
        capturedTools = options.tools;
        return { text: "ok", toolCalls: [], toolResults: [], steps: [], finishReason: "stop" };
      }),
    }));
    return () => capturedTools;
  }

  it("mensagem com sinal clínico (sintoma) -> a tool de substituição NUNCA é oferecida ao modelo neste turno", async () => {
    const getCapturedTools = mockMemoryAndCapture();
    const { runPatientAssistantTurn } = await import("../lib/ai/core/patient-orchestrator");
    const context = { clientId: "client-A" } as import("@/lib/ai/core/patient-context").PatientAssistantContext;
    await runPatientAssistantTurn(context, {
      messages: [{ role: "user", content: "Estou passando mal depois de comer, posso trocar o arroz por batata?" }],
    });
    expect(Object.keys(getCapturedTools())).not.toContain("searchAllowedFoodAlternatives");
    expect(Object.keys(getCapturedTools())).toContain("requestProfessionalReview");
  });

  it("mensagem sem sinal clínico -> a tool de substituição continua disponível normalmente", async () => {
    const getCapturedTools = mockMemoryAndCapture();
    const { runPatientAssistantTurn } = await import("../lib/ai/core/patient-orchestrator");
    const context = { clientId: "client-A" } as import("@/lib/ai/core/patient-context").PatientAssistantContext;
    await runPatientAssistantTurn(context, {
      messages: [{ role: "user", content: "Posso trocar o arroz por batata?" }],
    });
    expect(Object.keys(getCapturedTools())).toContain("searchAllowedFoodAlternatives");
  });
});

describe("runPatientAssistantTurn — hardening: mensagens do paciente nunca vao cruas para o LLM (secao 22/0.3)", () => {
  it("redige CPF/telefone/e-mail da mensagem do paciente antes de montar `messages` para generate()", async () => {
    vi.doMock("@/lib/ai/memory/patient-conversation-summary", () => ({
      getPatientConversationMemory: vi.fn().mockResolvedValue(null),
      recordPatientConversationTurn: vi.fn().mockResolvedValue(undefined),
    }));
    let capturedMessages: Array<{ role: string; content: string }> = [];
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generate: vi.fn(async (options: { messages: Array<{ role: string; content: string }> }) => {
        capturedMessages = options.messages;
        return { text: "ok", toolCalls: [], toolResults: [], steps: [], finishReason: "stop" };
      }),
    }));

    const { runPatientAssistantTurn } = await import("../lib/ai/core/patient-orchestrator");
    const context = { clientId: "client-A" } as import("@/lib/ai/core/patient-context").PatientAssistantContext;
    await runPatientAssistantTurn(context, {
      messages: [{ role: "user", content: "Meu CPF e 123.456.789-00, pode confirmar meus dados?" }],
    });

    expect(capturedMessages).toHaveLength(1);
    expect(capturedMessages[0].content).not.toContain("123.456.789-00");
    expect(capturedMessages[0].content).toContain("[CPF removido]");
  });
});

describe("resolvePatientAssistantContext — clientId sempre da sessao (secao 4/44)", () => {
  const sessionA: ClientPortalSession = { sub: "client-A", type: "client_portal", sessionVersion: 1 };

  it("o contexto resolvido usa session.sub, independente do que viria em qualquer input adicional", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({
      getClientById: vi.fn(async (id: string) => (id === "client-A" ? { id: "client-A", name: "Maria" } : null)),
    }));
    const { resolvePatientAssistantContext } = await import("../lib/ai/core/patient-context");
    const { context, client } = await resolvePatientAssistantContext(sessionA, { currentPage: "patient_meal_plan" });
    expect(context.clientId).toBe("client-A");
    expect(client.id).toBe("client-A");
  });

  it("sessao valida mas cliente sumiu do banco falha fechado (nunca segue com contexto incompleto)", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(null) }));
    const { resolvePatientAssistantContext } = await import("../lib/ai/core/patient-context");
    const { AiConfigError } = await import("../lib/ai/core/ai-errors");
    await expect(resolvePatientAssistantContext(sessionA, {})).rejects.toBeInstanceOf(AiConfigError);
  });
});
