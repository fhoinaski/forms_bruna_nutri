import { afterEach, describe, expect, it, vi } from "vitest";
import type { MealPlanMealPayload, MealPlanPayload } from "@/lib/repositories/meal-plans";

/**
 * FASE 4B (docs/AI-OPERATOR-AUDIT-ROADMAP.md) — fecha o gap de consistência
 * multi-source: `getMealPlanNutrition` (leitura) agora usa a MESMA
 * infraestrutura de resolução de referência (TACO/CUSTOM/MANUFACTURER,
 * medidas caseiras, snapshot histórico) que `applyMealPlanChangesWithPreview`
 * (escrita) já usava desde a Fase 4 — nunca um cálculo paralelo para a IA.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function customFoodRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "custom-1", name: "Barrinha proteica X", brand: null, source: "CUSTOM", portion_base_grams: 100,
    energy_kcal: 300, protein_g: 20, carbohydrate_g: 30, fat_g: 10, fiber_g: null, sodium_mg: 0,
    calcium_mg: null, iron_mg: null, potassium_mg: null, vitamin_c_mg: null, notes: null,
    created_at: "now", updated_at: "now",
    ...overrides,
  };
}

function portionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "portion-1", food_source: "TACO", food_ref_id: "175", description: "1 banana média",
    gram_equivalent: 90, source: "TBCA", source_version: null, confidence: "high", is_active: 1, created_at: "now",
    ...overrides,
  };
}

function planWith(meals: MealPlanMealPayload[], overrides: Partial<MealPlanPayload> = {}): MealPlanPayload {
  return {
    id: "plan-1", client_id: "client-1", title: "Plano padrão", target_group: null,
    status: "active", version: 3, notes: null, created_at: "now", updated_at: "now",
    meals, weekly_slots: [], substitutions: [], supplements: [],
    ...overrides,
  };
}

describe("getMealPlanNutrition — agregação multi-fonte (TACO + CUSTOM + MANUFACTURER + legado)", () => {
  it("soma corretamente os 4 tipos de item no mesmo total, nenhum fica de fora", async () => {
    const plan = planWith([
      {
        id: "meal-1", name: "Refeição única", suggested_time: null, notes: null, source_recipe_id: null,
        items: [
          { id: "item-taco", food: "Banana, da terra, crua", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "175" },
          { id: "item-custom", food: "Barrinha proteica X", quantity: "100", unit: "g", food_source: "CUSTOM", food_ref_id: "custom-1" },
          { id: "item-manuf", food: "Whey Y", quantity: "100", unit: "g", food_source: "MANUFACTURER", food_ref_id: "manuf-1" },
          { id: "item-legacy", food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g" }, // legado: sem food_source/food_ref_id, cai no fuzzy match por texto
        ],
      },
    ]);
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(plan) }));
    vi.doMock("@/lib/repositories/custom-foods", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/custom-foods")>("../lib/repositories/custom-foods");
      return {
        ...actual,
        getCustomFoodById: vi.fn().mockImplementation(async (id: string) => {
          if (id === "custom-1") return customFoodRow();
          if (id === "manuf-1") return customFoodRow({ id: "manuf-1", source: "MANUFACTURER", name: "Whey Y", energy_kcal: 400, protein_g: 80 });
          return null;
        }),
      };
    });
    const { executeGetMealPlanNutrition } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const result = await executeGetMealPlanNutrition({ mealPlanId: "plan-1" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    // 100g cada: banana ~128 + barrinha 300 + whey 400 + arroz ~128 = ~956 kcal.
    // Nenhuma fonte fica de fora do total (o bug antigo faria CUSTOM/MANUFACTURER contarem 0).
    expect(result.totalDay.kcal).toBeGreaterThan(900);
    expect(result.totalDay.protein).toBeGreaterThan(20 + 80); // pelo menos a proteina de custom+manufacturer já soma isso
  });

  it("regressão: sem a correção, um item CUSTOM sozinho no plano dava total kcal baixo/zero — agora reflete o valor real", async () => {
    const plan = planWith([
      {
        id: "meal-1", name: "Lanche", suggested_time: null, notes: null, source_recipe_id: null,
        items: [{ id: "item-custom", food: "Barrinha proteica X", quantity: "50", unit: "g", food_source: "CUSTOM", food_ref_id: "custom-1" }],
      },
    ]);
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(plan) }));
    vi.doMock("@/lib/repositories/custom-foods", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/custom-foods")>("../lib/repositories/custom-foods");
      return { ...actual, getCustomFoodById: vi.fn().mockResolvedValue(customFoodRow()) };
    });
    const { executeGetMealPlanNutrition } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const result = await executeGetMealPlanNutrition({ mealPlanId: "plan-1" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    // 50g de 300kcal/100g = 150kcal reais — nunca 0.
    expect(result.totalDay.kcal).toBeCloseTo(150, 0);
  });
});

describe("legacy fallback e snapshot histórico (item 3/4 do pedido)", () => {
  it("item legado sem food_source/food_ref_id continua resolvendo por fuzzy match (comportamento preservado, nunca quebra)", async () => {
    const plan = planWith([
      { id: "meal-1", name: "Café", suggested_time: null, notes: null, source_recipe_id: null, items: [{ id: "item-1", food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g" }] },
    ]);
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(plan) }));
    const { executeGetMealPlanNutrition } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const result = await executeGetMealPlanNutrition({ mealPlanId: "plan-1" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.totalDay.kcal).toBeCloseTo(128, 0);
  });

  it("item com snapshot histórico usa o snapshot, NUNCA recalcula pelo catálogo atual (plano antigo não muda retroativamente)", async () => {
    const historicalSnapshot = JSON.stringify({ energia_kcal: 999, proteina_g: 1, carboidrato_g: 1, lipidios_g: 1 });
    const plan = planWith([
      {
        id: "meal-1", name: "Histórico", suggested_time: null, notes: null, source_recipe_id: null,
        items: [{
          id: "item-1", food: "Alimento descontinuado", quantity: "100", unit: "g",
          food_source: "CUSTOM", food_ref_id: "custom-removido",
          food_name_snapshot: "Alimento descontinuado", nutrition_snapshot: historicalSnapshot,
        }],
      },
    ]);
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(plan) }));
    vi.doMock("@/lib/repositories/custom-foods", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/custom-foods")>("../lib/repositories/custom-foods");
      // O alimento personalizado foi removido do catálogo — getCustomFoodById devolve null.
      // Ainda assim, o total tem que refletir o SNAPSHOT (999 kcal/100g), nunca 0/erro.
      return { ...actual, getCustomFoodById: vi.fn().mockResolvedValue(null) };
    });
    const { executeGetMealPlanNutrition } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const result = await executeGetMealPlanNutrition({ mealPlanId: "plan-1" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.totalDay.kcal).toBeCloseTo(999, 0);
  });
});

describe("medidas caseiras — porção conhecida vs ausente", () => {
  it("porção conhecida (household_measure_id válido) usa a gramagem cadastrada", async () => {
    const plan = planWith([
      {
        id: "meal-1", name: "Café", suggested_time: null, notes: null, source_recipe_id: null,
        items: [{ id: "item-1", food: "Banana, da terra, crua", quantity: "1", unit: "unidade", food_source: "TACO", food_ref_id: "175", household_measure_id: "portion-1" }],
      },
    ]);
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(plan) }));
    vi.doMock("@/lib/repositories/food-portions", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/food-portions")>("../lib/repositories/food-portions");
      return { ...actual, getFoodPortionById: vi.fn().mockResolvedValue(portionRow()) };
    });
    const { executeGetMealPlanNutrition } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const result = await executeGetMealPlanNutrition({ mealPlanId: "plan-1" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    // 90g (gram_equivalent da porção) de banana ~128kcal/100g = ~115kcal.
    expect(result.totalDay.kcal).toBeCloseTo(128.0245 * 0.9, 0);
  });

  it("porção referenciada mas não encontrada cai na conversão genérica, nunca quebra o cálculo do plano inteiro", async () => {
    const plan = planWith([
      {
        id: "meal-1", name: "Café", suggested_time: null, notes: null, source_recipe_id: null,
        items: [{ id: "item-1", food: "Banana, da terra, crua", quantity: "1", unit: "unidade", food_source: "TACO", food_ref_id: "175", household_measure_id: "portion-removida" }],
      },
    ]);
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(plan) }));
    vi.doMock("@/lib/repositories/food-portions", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/food-portions")>("../lib/repositories/food-portions");
      return { ...actual, getFoodPortionById: vi.fn().mockResolvedValue(null) };
    });
    const { executeGetMealPlanNutrition } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const result = await executeGetMealPlanNutrition({ mealPlanId: "plan-1" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(Number.isFinite(result.totalDay.kcal)).toBe(true);
  });
});

describe("NULL vs zero real na agregação (item 6 do pedido) — via calculatePlanNutrients direto", () => {
  it("nutriente ausente (null) na fonte nunca vira zero na soma; zero real permanece zero", async () => {
    const { buildFoodReferenceLookup } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const { calculatePlanNutrients } = await import("../lib/nutrition/nutrients");
    const customRef = {
      numero: "custom-1", descricao: "Barrinha proteica X", fonte: "custom" as const,
      energia_kcal: 300, proteina_g: 20, carboidrato_g: 30, lipidios_g: 10,
      sodio_mg: 0, // zero REAL
      ferro_mg: null, // desconhecido
    };
    const lookup = buildFoodReferenceLookup([customRef], new Map());
    const plan = {
      meals: [
        { id: "meal-1", name: "Lanche", items: [{ id: "item-1", food: "Barrinha proteica X", quantity: "100", unit: "g", food_source: "CUSTOM", food_ref_id: "custom-1" }] },
      ],
    };
    const { total } = calculatePlanNutrients(plan as never, lookup);
    expect(total.values.sodiumMg).toBe(0); // zero real preservado, nao null
    expect(total.values.ironMg).toBeNull(); // ausente preservado, nunca virou 0
    expect(total.coverage.sodiumMg.known).toBe(1);
    expect(total.coverage.ironMg.known).toBe(0);
  });
});

describe("fluxo do assistente (item 8 do pedido) — write versionado seguido de leitura reflete o novo total", () => {
  it("depois de aplicar 'adicione 100g de banana', getMealPlanNutrition no plano resultante já soma o item novo", async () => {
    // IMPORTANTE: nunca importar (mesmo dinamicamente) um modulo que toca
    // @/lib/repositories/meal-plans ANTES de registrar o vi.doMock dele — o
    // import cacheia a instancia real do modulo, e um vi.doMock registrado
    // DEPOIS nao desfaz esse cache dentro do MESMO teste (mesma armadilha
    // documentada na FASE 3: doMock so afeta import() dinamico que roda
    // DEPOIS do registro). Por isso o doMock vem primeiro, e um UNICO
    // import() depois pega as duas funcoes.
    const plan = planWith([
      { id: "meal-1", name: "Café da manhã", suggested_time: "08:00", notes: null, source_recipe_id: null, items: [] },
    ]);
    let updatedPlan: MealPlanPayload | null = null;
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockImplementation(async () => updatedPlan) }));

    const { applyMealPlanChangesWithPreview, executeGetMealPlanNutrition } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const applied = applyMealPlanChangesWithPreview(
      plan.meals,
      [{ operation: "add_item", mealId: "meal-1", food: { foodName: "Banana, da terra, crua", source: "TACO", refId: "175" }, quantity: 100, unit: "g" }],
      plan.title
    );
    updatedPlan = planWith(applied.meals);

    const nutrition = await executeGetMealPlanNutrition({ mealPlanId: "plan-1" });
    expect(nutrition.found).toBe(true);
    if (!nutrition.found) return;
    expect(nutrition.totalDay.kcal).toBeCloseTo(128, 0);
    expect(nutrition.totalDay.protein).toBeGreaterThan(0);
  });
});
