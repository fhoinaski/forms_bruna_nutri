import { afterEach, describe, expect, it, vi } from "vitest";
import type { MealPlanPayload } from "@/lib/repositories/meal-plans";
import type { Appointment } from "@/lib/repositories/appointments";

/**
 * Tools de LEITURA do PATIENT_ASSISTANT — cobre secao 6 (nunca vazar campo
 * interno como notes/cancellation_reason/telefone), secao 45 (substituicao:
 * existe/inexistente/nao pertence ao paciente), e o principio geral de
 * "so dados do proprio paciente, calculados deterministicamente".
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function makePlan(overrides: Partial<MealPlanPayload> = {}): MealPlanPayload {
  return {
    id: "plan-1", client_id: "client-1", title: "Plano da Maria", target_group: null,
    status: "active", version: 2, notes: null, created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z",
    meals: [
      { id: "meal-1", name: "Café da manhã", suggested_time: "08:00", notes: null, source_recipe_id: null, items: [{ id: "item-1", food: "Pão francês", quantity: "2", unit: "unidade", notes: null }] },
      { id: "meal-2", name: "Lanche da tarde", suggested_time: "15:00", notes: null, source_recipe_id: null, items: [{ id: "item-2", food: "Banana, da terra, crua", quantity: "100", unit: "g", notes: null }] },
    ],
    weekly_slots: [], substitutions: [], supplements: [],
    ...overrides,
  };
}

function mockSafeSubstitutionPolicyDeps(enabled = false) {
  vi.doMock("@/lib/repositories/ai-settings", () => ({
    getAISettings: vi.fn().mockResolvedValue({ patient_safe_substitutions_enabled: enabled ? 1 : 0 }),
  }));
  vi.doMock("@/lib/repositories/nutrition-records", () => ({
    getExistingNutritionRecord: vi.fn().mockResolvedValue(null),
  }));
  vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({
    listPatientClinicalMarkers: vi.fn().mockResolvedValue([]),
  }));
  vi.doMock("@/lib/repositories/patient-food-substitution-events", () => ({
    createPatientFoodSubstitutionEvent: vi.fn().mockResolvedValue("event-1"),
  }));
  vi.doMock("@/lib/security/audit", () => ({
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
  }));
}

describe("executeGetMyMealPlan", () => {
  it("retorna o plano ativo do cliente informado", async () => {
    const getActiveMealPlan = vi.fn().mockResolvedValue(makePlan());
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan }));
    const { executeGetMyMealPlan } = await import("../lib/ai/agents/patient/patient-portal-agent");
    const result = await executeGetMyMealPlan("client-1");
    expect(getActiveMealPlan).toHaveBeenCalledWith("client-1");
    expect(result).toEqual({
      found: true,
      mealPlanId: "plan-1",
      mealPlanTitle: "Plano da Maria",
      meals: [
        { mealId: "meal-1", name: "Café da manhã", suggestedTime: "08:00", items: [{ itemId: "item-1", food: "Pão francês", quantity: "2", unit: "unidade" }] },
        { mealId: "meal-2", name: "Lanche da tarde", suggestedTime: "15:00", items: [{ itemId: "item-2", food: "Banana, da terra, crua", quantity: "100", unit: "g" }] },
      ],
    });
  });

  it("sem plano ativo, retorna found:false — nunca inventa um plano", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(null) }));
    const { executeGetMyMealPlan } = await import("../lib/ai/agents/patient/patient-portal-agent");
    expect(await executeGetMyMealPlan("client-1")).toEqual({ found: false });
  });
});

describe("executeGetMyMealDetails — busca seletiva (secao 29)", () => {
  it("acha a refeicao por query parcial ('café' casa com 'Café da manhã')", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlan()) }));
    const { executeGetMyMealDetails } = await import("../lib/ai/agents/patient/patient-portal-agent");
    const result = await executeGetMyMealDetails("client-1", { mealQuery: "café" });
    expect(result).toEqual({
      found: true, mealPlanId: "plan-1", mealId: "meal-1", mealName: "Café da manhã", suggestedTime: "08:00",
      items: [{ itemId: "item-1", food: "Pão francês", quantity: "2", unit: "unidade" }],
    });
  });

  it("refeicao nao encontrada no plano retorna found:false", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlan()) }));
    const { executeGetMyMealDetails } = await import("../lib/ai/agents/patient/patient-portal-agent");
    expect(await executeGetMyMealDetails("client-1", { mealQuery: "jantar" })).toEqual({ found: false });
  });
});

describe("executeGetMyAppointments — nunca vaza campo interno (secao 6/23)", () => {
  it("so devolve startsAtIso/type/location/status — nunca notes, cancellation_reason, telefone ou e-mail", async () => {
    const appointments: Appointment[] = [
      {
        id: "apt-1", client_id: "client-1", client_name: "Maria Silva", client_phone: "11999999999", client_email: "maria@example.com",
        title: "Consulta", appointment_type: "consulta", starts_at: "2099-01-01T15:00:00.000Z", ends_at: "2099-01-01T16:00:00.000Z",
        status: "agendado", location: "Online", notes: "Paciente relatou episodio de compulsao — sigiloso.",
        portal_visible: 1, client_confirmed_at: null, cancellation_reason: null,
        created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z",
      },
    ];
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments: vi.fn().mockResolvedValue(appointments) }));
    const { executeGetMyAppointments } = await import("../lib/ai/agents/patient/patient-portal-agent");
    const result = await executeGetMyAppointments("client-1", { scope: "next" });
    expect(result).toEqual({
      appointments: [{ appointmentId: "apt-1", startsAtIso: "2099-01-01T15:00:00.000Z", type: "consulta", location: "Online", status: "agendado" }],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("compulsao");
    expect(serialized).not.toContain("11999999999");
    expect(serialized).not.toContain("maria@example.com");
  });

  it("scope 'next' limita a 1, scope 'all' devolve todas as futuras nao canceladas em ordem", async () => {
    const appointments: Appointment[] = ["2099-03-01", "2099-01-01", "2099-02-01"].map((date, index) => ({
      id: `apt-${index}`, client_id: "client-1", client_name: null, client_phone: null, client_email: null,
      title: "Consulta", appointment_type: "consulta", starts_at: `${date}T10:00:00.000Z`, ends_at: null,
      status: "agendado", location: null, notes: null, portal_visible: 1, client_confirmed_at: null, cancellation_reason: null,
      created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z",
    }));
    appointments.push({
      id: "apt-cancelado", client_id: "client-1", client_name: null, client_phone: null, client_email: null,
      title: "Cancelada", appointment_type: "consulta", starts_at: "2099-01-15T10:00:00.000Z", ends_at: null,
      status: "cancelado", location: null, notes: null, portal_visible: 1, client_confirmed_at: null, cancellation_reason: "remarcada",
      created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z",
    });
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments: vi.fn().mockResolvedValue(appointments) }));
    const { executeGetMyAppointments } = await import("../lib/ai/agents/patient/patient-portal-agent");

    const next = await executeGetMyAppointments("client-1", { scope: "next" });
    expect(next.appointments).toHaveLength(1);
    expect(next.appointments[0].startsAtIso).toBe("2099-01-01T10:00:00.000Z");

    const all = await executeGetMyAppointments("client-1", { scope: "all" });
    expect(all.appointments.map((appointment) => appointment.startsAtIso)).toEqual([
      "2099-01-01T10:00:00.000Z", "2099-02-01T10:00:00.000Z", "2099-03-01T10:00:00.000Z",
    ]);
  });
});

describe("executeGetMyTasks", () => {
  it("busca so tarefas pendentes do cliente informado", async () => {
    const getClientTasks = vi.fn().mockResolvedValue([{ id: "task-1", title: "Enviar exames", due_date: "2026-08-20" }]);
    vi.doMock("@/lib/repositories/client-tasks", () => ({ getClientTasks }));
    const { executeGetMyTasks } = await import("../lib/ai/agents/patient/patient-portal-agent");
    const result = await executeGetMyTasks("client-1");
    expect(getClientTasks).toHaveBeenCalledWith("client-1", { status: "pendente" });
    expect(result).toEqual({ tasks: [{ taskId: "task-1", title: "Enviar exames", dueDate: "2026-08-20" }] });
  });
});

describe("executeSearchAllowedFoodAlternatives — ancorado no proprio plano (secao 10/45)", () => {
  it("alimento existe no plano: devolve alternativas reais da TACO, nunca 'aprovado'", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlan()) }));
    mockSafeSubstitutionPolicyDeps();
    const { executeSearchAllowedFoodAlternatives } = await import("../lib/ai/agents/patient/patient-portal-agent");
    const result = await executeSearchAllowedFoodAlternatives("client-1", { currentFood: "banana", desiredFood: "maçã" });
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("esperava found true");
    expect(result.mealName).toBe("Lanche da tarde");
    expect(result.currentFood).toBe("Banana, da terra, crua");
    expect(result.mealId).toBe("meal-2");
    expect(result.itemId).toBe("item-2");
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(JSON.stringify(result).toLowerCase()).not.toContain("aprovad");
  });

  it("alimento nao pertence ao plano do paciente: found false, nunca faz busca solta sem ancora", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlan()) }));
    const { executeSearchAllowedFoodAlternatives } = await import("../lib/ai/agents/patient/patient-portal-agent");
    const result = await executeSearchAllowedFoodAlternatives("client-1", { currentFood: "picanha grelhada com batata frita" });
    expect(result).toEqual({ found: false, reason: "item_not_in_plan" });
  });

  it("sem plano alimentar ativo: found false com motivo claro", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(null) }));
    const { executeSearchAllowedFoodAlternatives } = await import("../lib/ai/agents/patient/patient-portal-agent");
    const result = await executeSearchAllowedFoodAlternatives("client-1", { currentFood: "banana" });
    expect(result).toEqual({ found: false, reason: "meal_plan_not_found" });
  });

  it("Killer Feature 4 (seção 9): mesmo alimento em mais de uma refeição -> ambiguous_item, nunca escolhe a primeira ocorrência silenciosamente", async () => {
    const planWithTwoRices = makePlan({
      meals: [
        { id: "meal-almoco", name: "Almoço", suggested_time: "12:00", notes: null, source_recipe_id: null, items: [{ id: "item-1", food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g", notes: null }] },
        { id: "meal-jantar", name: "Jantar", suggested_time: "19:00", notes: null, source_recipe_id: null, items: [{ id: "item-2", food: "Arroz, tipo 1, cozido", quantity: "80", unit: "g", notes: null }] },
      ],
    });
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(planWithTwoRices) }));
    const { executeSearchAllowedFoodAlternatives } = await import("../lib/ai/agents/patient/patient-portal-agent");
    const result = await executeSearchAllowedFoodAlternatives("client-1", { currentFood: "arroz" });
    expect(result).toEqual({
      found: false,
      reason: "ambiguous_item",
      matches: [
        { mealId: "meal-almoco", mealName: "Almoço", itemId: "item-1", food: "Arroz, tipo 1, cozido" },
        { mealId: "meal-jantar", mealName: "Jantar", itemId: "item-2", food: "Arroz, tipo 1, cozido" },
      ],
    });
  });

  it("Killer Feature 4: quando desiredFood é informado e o item é único, devolve substitution com quantidade calculada pela engine", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlan()) }));
    mockSafeSubstitutionPolicyDeps(true);
    const { executeSearchAllowedFoodAlternatives } = await import("../lib/ai/agents/patient/patient-portal-agent");
    const result = await executeSearchAllowedFoodAlternatives("client-1", { currentFood: "pão francês", desiredFood: "batata, inglesa, cozida" });
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("esperava found true");
    expect(result.mealPlanVersion).toBe(2);
    expect(result.substitution).toBeDefined();
    expect(result.substitutionPolicy?.decision).toBe("requires_review");
  });
});

describe("executeNavigatePatientPortal — allow-list fechada (secao 33)", () => {
  it("repassa so a secao valida recebida", async () => {
    const { executeNavigatePatientPortal } = await import("../lib/ai/agents/patient/patient-portal-agent");
    expect(await executeNavigatePatientPortal({ section: "meal_plan" })).toEqual({ section: "meal_plan" });
    expect(await executeNavigatePatientPortal({ section: "tasks" })).toEqual({ section: "tasks" });
  });

  it("o schema Zod rejeita qualquer secao fora do allow-list (nunca uma URL/rota livre)", async () => {
    const { navigatePatientPortalInputSchema } = await import("../lib/ai/agents/patient/patient-portal-agent");
    expect(navigatePatientPortalInputSchema.safeParse({ section: "admin_dashboard" }).success).toBe(false);
    expect(navigatePatientPortalInputSchema.safeParse({ section: "/dashboard" }).success).toBe(false);
  });
});
