import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Paridade editor / print / portal (seção 8 do pedido de fechamento de
 * gaps) — as três superfícies leem a MESMA linha de meal_plan_substitutions
 * (via getMealPlanById/getActiveMealPlan), nunca uma cópia derivada. Este
 * teste prova que os valores (base_food, option_food, quantidade, unidade)
 * chegam idênticos em cada leitura, e que o portal nunca perde/altera o que
 * o editor gravou (só filtra pendentes, nunca transforma o conteúdo).
 *
 * Nota: só um único `vi.doMock("@/lib/repositories/meal-plans", ...)` é
 * registrado no arquivo inteiro (com getMealPlanById E getActiveMealPlan
 * sempre presentes) — Vitest 4.x usa a PRIMEIRA registração de um specifier
 * pro arquivo todo, então um segundo doMock com shape diferente seria
 * silenciosamente ignorado (ver memória do projeto sobre esse comportamento).
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const PLAN_ROW = {
  id: "plan-1", client_id: "client-1", title: "Plano", target_group: null, status: "active", version: 2, notes: null,
  target_energy_kcal: null, target_protein_g: null, target_carbohydrate_g: null, target_fat_g: null,
  created_at: "now", updated_at: "now",
};

const SUBSTITUTION_ROW = {
  id: "sub-1", meal_plan_id: "plan-1", base_food: "Arroz, tipo 1, cozido", option_food: "Batata, inglesa, cozida",
  quantity: "180", unit: "g", notes: null,
  base_food_source: "TACO", base_food_ref_id: "3", option_food_source: "TACO", option_food_ref_id: "91",
  option_nutrition_snapshot: JSON.stringify({ energyKcal: 126, proteinG: 2.4, carbohydrateG: 28.6, fatG: 0.1, fiberG: 2.4 }),
  equivalence_mode: "energy", equivalence_score: 0.03, equivalence_quality: "EXCELLENT",
  approved_by_professional: 1, ai_suggested: 0, sort_order: 0,
};
const PENDING_ROW = { ...SUBSTITUTION_ROW, id: "sub-2", approved_by_professional: 0, ai_suggested: 1, option_food: "Mandioca cozida", option_food_ref_id: "180" };

function mockD1(rows: typeof SUBSTITUTION_ROW[]) {
  vi.doMock("@/lib/d1/client", () => ({
    d1Batch: vi.fn(async (statements: { sql: string }[]) =>
      statements.map((statement) => statement.sql.includes("FROM meal_plan_substitutions") ? { results: rows, success: true } : { results: [], success: true })
    ),
    d1Query: vi.fn().mockImplementation(async (sql: string) => sql.includes("FROM meal_plans") ? [PLAN_ROW] : sql.includes("FROM clients") ? [{ id: "client-1", name: "Teste", email: null, phone: null }] : []),
    d1Execute: vi.fn(),
  }));
  vi.doMock("@/lib/repositories/protocol-templates", () => ({ getAllTemplates: vi.fn() }));
  vi.doMock("@/lib/repositories/nutrition-records", () => ({ getExistingNutritionRecord: vi.fn().mockResolvedValue(null) }));
  vi.doMock("@/lib/repositories/portal-protocols", () => ({ getPortalProtocols: vi.fn().mockResolvedValue([]) }));
  vi.doMock("@/lib/security/encrypted-fields", () => ({ encryptJsonValue: (v: unknown) => `encj:${JSON.stringify(v)}` }));
}

describe("paridade editor/print/portal — mesma substituição, mesmos valores", () => {
  it("getMealPlanById (fonte do editor e do print) devolve base_food/option_food/quantity/unit idênticos ao gravado", async () => {
    mockD1([SUBSTITUTION_ROW]);
    const { getMealPlanById } = await import("../lib/repositories/meal-plans");
    const plan = await getMealPlanById("plan-1");

    expect(plan?.substitutions).toHaveLength(1);
    const sub = plan!.substitutions[0];
    expect(sub.base_food).toBe("Arroz, tipo 1, cozido");
    expect(sub.option_food).toBe("Batata, inglesa, cozida");
    expect(sub.quantity).toBe("180");
    expect(sub.unit).toBe("g");
    expect(sub.approved_by_professional).toBe(true);
  });

  it("getClientPortalSummary (fonte do portal) devolve a MESMA substituição aprovada, com os mesmos valores — nunca uma transformação", async () => {
    mockD1([SUBSTITUTION_ROW]);
    const { getClientPortalSummary } = await import("../lib/repositories/client-portal");
    const summary = await getClientPortalSummary("client-1");

    expect(summary?.mealPlan?.substitutions).toHaveLength(1);
    const sub = summary!.mealPlan!.substitutions[0];
    // Mesmos valores que o editor/print leriam pra essa mesma linha — nenhuma transformação a mais.
    expect(sub.base_food).toBe("Arroz, tipo 1, cozido");
    expect(sub.option_food).toBe("Batata, inglesa, cozida");
    expect(sub.quantity).toBe("180");
    expect(sub.unit).toBe("g");
  });

  it("substituição PENDENTE (não aprovada): editor vê as duas (aprovada + pendente)", async () => {
    mockD1([SUBSTITUTION_ROW, PENDING_ROW]);
    const { getMealPlanById } = await import("../lib/repositories/meal-plans");
    const plan = await getMealPlanById("plan-1");
    expect(plan?.substitutions).toHaveLength(2);
  });

  it("substituição PENDENTE (não aprovada): portal nunca vê, mas o valor da aprovada é o mesmo que o editor tinha pra ela", async () => {
    mockD1([SUBSTITUTION_ROW, PENDING_ROW]);
    const { getClientPortalSummary } = await import("../lib/repositories/client-portal");
    const summary = await getClientPortalSummary("client-1");

    // Portal: só a aprovada, com o MESMO valor que o editor/print teriam pra ela.
    expect(summary?.mealPlan?.substitutions).toHaveLength(1);
    expect(summary?.mealPlan?.substitutions[0].option_food).toBe("Batata, inglesa, cozida");
  });
});
