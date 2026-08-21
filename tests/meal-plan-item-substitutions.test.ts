import { afterEach, describe, expect, it, vi } from "vitest";
import { calculatePlanNutrients } from "@/lib/nutrition/nutrients";
import { TACO_REFERENCES, getTacoFoodByNumber } from "@/lib/nutrition/taco";

/**
 * Substituições nutricionais equivalentes por item — evolução da tabela
 * meal_plan_substitutions já existente (nunca uma tabela nova). Prova:
 * (1) os novos campos (identidade estruturada, score, aprovação) são
 * persistidos e lidos de volta corretamente; (2) linhas antigas/legadas sem
 * esses campos continuam "aprovadas" por padrão (nunca escondidas
 * silenciosamente); (3) o portal do paciente nunca recebe uma substituição
 * pendente de aprovação.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const PLAN_ROW = {
  id: "plan-1", client_id: "client-1", title: "Plano", target_group: null, status: "draft", version: 1, notes: null,
  target_energy_kcal: null, target_protein_g: null, target_carbohydrate_g: null, target_fat_g: null,
  created_at: "now", updated_at: "now",
};

function mockD1() {
  const batchCalls: { sql: string; params?: unknown[] }[][] = [];
  const d1Batch = vi.fn(async (statements: { sql: string; params?: unknown[] }[]) => {
    batchCalls.push(statements);
    return statements.map(() => ({ results: [], success: true }));
  });
  const d1Query = vi.fn(async (sql: string) => (sql.includes("FROM meal_plans") ? [PLAN_ROW] : []));
  vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query, d1Execute: vi.fn() }));
  vi.doMock("@/lib/repositories/protocol-templates", () => ({ getAllTemplates: vi.fn() }));
  vi.doMock("@/lib/security/encrypted-fields", () => ({ encryptJsonValue: (v: unknown) => `encj:${JSON.stringify(v)}` }));
  return { batchCalls };
}

function substitutionInsertRows(batchCalls: { sql: string; params?: unknown[] }[][]) {
  const insert = batchCalls.flat().find((statement) => statement.sql.includes("INSERT INTO meal_plan_substitutions"));
  if (!insert) return [];
  return JSON.parse(insert.params![0] as string) as Array<Record<string, unknown>>;
}

describe("persistência — campos novos de substituição equivalente por item", () => {
  it("grava identidade estruturada, score/qualidade e approved_by_professional=0 pra sugestão da IA ainda não aprovada", async () => {
    const { batchCalls } = mockD1();
    const { createMealPlan } = await import("../lib/repositories/meal-plans");

    await createMealPlan({
      clientId: "client-1",
      title: "Plano",
      meals: [],
      substitutions: [{
        base_food: "Arroz, tipo 1, cozido",
        option_food: "Batata, inglesa, cozida",
        quantity: "180",
        unit: "g",
        base_food_source: "TACO",
        base_food_ref_id: "1",
        option_food_source: "TACO",
        option_food_ref_id: "2",
        option_nutrition_snapshot: JSON.stringify({ energyKcal: 128 }),
        equivalence_mode: "energy",
        equivalence_score: 0.02,
        equivalence_quality: "EXCELLENT",
        approved_by_professional: false,
        ai_suggested: true,
      }],
      supplements: [],
    });

    const rows = substitutionInsertRows(batchCalls);
    expect(rows).toHaveLength(1);
    expect(rows[0].baseFoodSource).toBe("TACO");
    expect(rows[0].baseFoodRefId).toBe("1");
    expect(rows[0].optionFoodSource).toBe("TACO");
    expect(rows[0].optionFoodRefId).toBe("2");
    expect(rows[0].equivalenceMode).toBe("energy");
    expect(rows[0].equivalenceQuality).toBe("EXCELLENT");
    expect(rows[0].approvedByProfessional).toBe(0);
    expect(rows[0].aiSuggested).toBe(1);
  });

  it("substituição sem approved_by_professional explícito grava como aprovada (1) — compatibilidade com curadoria manual/templates já existente", async () => {
    const { batchCalls } = mockD1();
    const { createMealPlan } = await import("../lib/repositories/meal-plans");

    await createMealPlan({
      clientId: "client-1",
      title: "Plano",
      meals: [],
      substitutions: [{ base_food: "Grupo de carboidratos", option_food: "Mandioca cozida", quantity: null, unit: null }],
      supplements: [],
    });

    const rows = substitutionInsertRows(batchCalls);
    expect(rows[0].approvedByProfessional).toBe(1);
    expect(rows[0].aiSuggested).toBe(0);
  });

  it("leitura (hydrateMealPlans): devolve approved_by_professional=true por padrão quando a coluna vem NULL/ausente no banco (linha legada)", async () => {
    const substitutionRows = [
      { id: "sub-1", meal_plan_id: "plan-1", base_food: "Arroz cozido", option_food: "Batata cozida", quantity: "150", unit: "g", sort_order: 0 },
    ];
    const d1Batch = vi.fn(async (statements: { sql: string }[]) =>
      statements.map((statement) => statement.sql.includes("FROM meal_plan_substitutions") ? { results: substitutionRows, success: true } : { results: [], success: true })
    );
    const d1Query = vi.fn().mockResolvedValue([PLAN_ROW]);
    vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query, d1Execute: vi.fn() }));
    vi.doMock("@/lib/repositories/protocol-templates", () => ({ getAllTemplates: vi.fn() }));
    vi.doMock("@/lib/security/encrypted-fields", () => ({ encryptJsonValue: (v: unknown) => `encj:${JSON.stringify(v)}` }));
    const { getMealPlanById } = await import("../lib/repositories/meal-plans");

    const plan = await getMealPlanById("plan-1");
    expect(plan?.substitutions[0].approved_by_professional).toBe(true);
  });

  it("leitura: approved_by_professional=0 explícito no banco vira false (nunca coagido pra true)", async () => {
    const substitutionRows = [
      { id: "sub-1", meal_plan_id: "plan-1", base_food: "Arroz cozido", option_food: "Batata cozida", quantity: "150", unit: "g", sort_order: 0, approved_by_professional: 0, ai_suggested: 1 },
    ];
    const d1Batch = vi.fn(async (statements: { sql: string }[]) =>
      statements.map((statement) => statement.sql.includes("FROM meal_plan_substitutions") ? { results: substitutionRows, success: true } : { results: [], success: true })
    );
    const d1Query = vi.fn().mockResolvedValue([PLAN_ROW]);
    vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query, d1Execute: vi.fn() }));
    vi.doMock("@/lib/repositories/protocol-templates", () => ({ getAllTemplates: vi.fn() }));
    vi.doMock("@/lib/security/encrypted-fields", () => ({ encryptJsonValue: (v: unknown) => `encj:${JSON.stringify(v)}` }));
    const { getMealPlanById } = await import("../lib/repositories/meal-plans");

    const plan = await getMealPlanById("plan-1");
    expect(plan?.substitutions[0].approved_by_professional).toBe(false);
    expect(plan?.substitutions[0].ai_suggested).toBe(true);
  });
});

describe("portal do paciente — nunca mostra substituição pendente de aprovação", () => {
  it("getClientPortalSummary filtra approved_by_professional=false do mealPlan antes de devolver", async () => {
    const mealPlan = {
      id: "plan-1", client_id: "client-1", title: "Plano", status: "active", version: 1,
      meals: [], weekly_slots: [], supplements: [],
      substitutions: [
        { base_food: "Arroz", option_food: "Batata", approved_by_professional: true },
        { base_food: "Arroz", option_food: "Mandioca", approved_by_professional: false },
      ],
    };
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(mealPlan) }));
    vi.doMock("@/lib/repositories/nutrition-records", () => ({ getExistingNutritionRecord: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/d1/client", () => ({
      d1Query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("FROM clients")) return [{ id: "client-1", name: "Teste", email: null, phone: null }];
        return [];
      }),
    }));
    vi.doMock("@/lib/repositories/portal-protocols", () => ({ getPortalProtocols: vi.fn().mockResolvedValue([]) }));

    const { getClientPortalSummary } = await import("../lib/repositories/client-portal");
    const summary = await getClientPortalSummary("client-1");

    expect(summary?.mealPlan?.substitutions).toHaveLength(1);
    expect(summary?.mealPlan?.substitutions[0].option_food).toBe("Batata");
  });
});

describe("regressão nutricional — substituições NUNCA somam ao total do plano (seções 16/33)", () => {
  it("calculatePlanNutrients ignora completamente plan.substitutions — total vem só dos itens PRESCRITOS", () => {
    const rice = TACO_REFERENCES.find((f) => typeof f.numero === "number" && (f.carboidrato_g ?? 0) > 20 && (f.proteina_g ?? 0) < 5)!;
    const plan = {
      meals: [{ id: "meal-1", name: "Almoço", items: [{ id: "item-1", food: rice.descricao, quantity: "100", unit: "g", food_source: "TACO" as const, food_ref_id: String(rice.numero) }] }],
    };
    const lookup = { byTacoNumber: (n: string) => getTacoFoodByNumber(n), byCustomId: () => null, fuzzyMatch: () => null };

    const withoutSubstitutions = calculatePlanNutrients(plan, lookup);

    // Mesmo plano, mas com uma substituição "pendurada" no objeto (como
    // viria de um plano real do banco) — calculatePlanNutrients nem recebe
    // esse campo como parâmetro, então não há como ele influenciar o total.
    // Este teste documenta e trava esse contrato: substituições são
    // alternativas, nunca itens consumidos simultaneamente com o original.
    const planWithSubstitutions = {
      ...plan,
      substitutions: [{ base_food: rice.descricao, option_food: "Batata inglesa cozida", quantity: "180", unit: "g", approved_by_professional: true }],
    };
    const withSubstitutions = calculatePlanNutrients(planWithSubstitutions, lookup);

    expect(withSubstitutions.total.values.energyKcal).toBe(withoutSubstitutions.total.values.energyKcal);
    expect(withSubstitutions.total.values.proteinG).toBe(withoutSubstitutions.total.values.proteinG);
    // Confirma que o total é mesmo só do arroz (100g), não 100g arroz + 180g batata.
    expect(withoutSubstitutions.total.values.energyKcal).toBeCloseTo(rice.energia_kcal, 4);
  });
});
