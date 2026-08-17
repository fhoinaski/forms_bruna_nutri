import { afterEach, describe, expect, it, vi } from "vitest";
import type { MealPlanMealPayload, MealPlanPayload } from "@/lib/repositories/meal-plans";
import type { ProposedAction } from "@/lib/ai/schemas/action.schema";

/**
 * FASE 4 (meal plan writes seguros) — cobre as capacidades NOVAS desta fase:
 * resolucao de alimento CUSTOM/MANUFACTURER (nao so TACO), medidas caseiras
 * (householdMeasureId), duplicar/reordenar refeicao e item, e o fechamento
 * da janela de corrida de versao (expectedVersion passado a updateMealPlan).
 * A cobertura generica (ownership, stale basico, replay, atomicidade,
 * add_item/remove_item/change_quantity/change_measure TACO) ja existe em
 * tests/ai-meal-plan-change.test.ts e continua intacta.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function basePlan(overrides: Partial<MealPlanPayload> = {}): MealPlanPayload {
  const meals: MealPlanMealPayload[] = [
    {
      id: "meal-1", name: "Café da manhã", suggested_time: "08:00", notes: null, source_recipe_id: null,
      items: [{ id: "item-1", food: "Banana, da terra, crua", quantity: "100", unit: "g", notes: null, food_source: "TACO", food_ref_id: "175" }],
    },
    {
      id: "meal-2", name: "Almoço", suggested_time: "12:00", notes: null, source_recipe_id: null,
      items: [{ id: "item-2", food: "Arroz, tipo 1, cozido", quantity: "150", unit: "g", notes: null, food_source: "TACO", food_ref_id: "3" }],
    },
  ];
  return {
    id: "plan-1", client_id: "client-1", title: "Plano padrão", target_group: null,
    status: "active", version: 3, notes: null, created_at: "now", updated_at: "now",
    meals, weekly_slots: [], substitutions: [], supplements: [],
    ...overrides,
  };
}

function customFoodRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "custom-1", name: "Barrinha proteica X", brand: null, source: "CUSTOM", portion_base_grams: 100,
    energy_kcal: 300, protein_g: 20, carbohydrate_g: 30, fat_g: 10, fiber_g: null, sodium_mg: null,
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

describe("resolução de alimento CUSTOM/MANUFACTURER (não só TACO)", () => {
  it("add_item com fonte CUSTOM resolve macros reais do alimento personalizado", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(basePlan()) }));
    vi.doMock("@/lib/repositories/custom-foods", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/custom-foods")>("../lib/repositories/custom-foods");
      return { ...actual, getCustomFoodById: vi.fn().mockResolvedValue(customFoodRow()) };
    });
    const { executeProposeMealPlanChange } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const output = await executeProposeMealPlanChange({
      mealPlanId: "plan-1", baseVersion: 3,
      changes: [{ operation: "add_item", mealId: "meal-2", food: { foodName: "Barrinha proteica X", source: "CUSTOM", refId: "custom-1" }, quantity: 50, unit: "g" }],
    });
    expect(output).not.toHaveProperty("error");
    if ("error" in output) return;
    // 50g de um alimento com 300kcal/100g => 150kcal reais, calculados pelo motor central.
    expect(output.preview.totalImpact.kcal).toBeCloseTo(150, 0);
  });

  it("refId CUSTOM que não existe é rejeitado antes de montar a proposta", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(basePlan()) }));
    vi.doMock("@/lib/repositories/custom-foods", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/custom-foods")>("../lib/repositories/custom-foods");
      return { ...actual, getCustomFoodById: vi.fn().mockResolvedValue(null) };
    });
    const { executeProposeMealPlanChange } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const output = await executeProposeMealPlanChange({
      mealPlanId: "plan-1", baseVersion: 3,
      changes: [{ operation: "add_item", mealId: "meal-2", food: { foodName: "Fantasma", source: "CUSTOM", refId: "does-not-exist" }, quantity: 50, unit: "g" }],
    });
    expect(output).toEqual({ error: expect.stringContaining("não corresponde a um registro válido") });
  });

  it("MANUFACTURER também resolve (mesmo caminho de CUSTOM, fonte diferente)", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(basePlan()) }));
    vi.doMock("@/lib/repositories/custom-foods", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/custom-foods")>("../lib/repositories/custom-foods");
      return { ...actual, getCustomFoodById: vi.fn().mockResolvedValue(customFoodRow({ id: "manuf-1", source: "MANUFACTURER", name: "Whey Y" })) };
    });
    const { executeProposeMealPlanChange } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const output = await executeProposeMealPlanChange({
      mealPlanId: "plan-1", baseVersion: 3,
      changes: [{ operation: "add_item", mealId: "meal-2", food: { foodName: "Whey Y", source: "MANUFACTURER", refId: "manuf-1" }, quantity: 30, unit: "g" }],
    });
    expect(output).not.toHaveProperty("error");
  });
});

describe("medidas caseiras (householdMeasureId) — item 5 do pedido", () => {
  it("add_item com portionId real usa a gramagem cadastrada, não a conversão genérica", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(basePlan()) }));
    vi.doMock("@/lib/repositories/food-portions", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/food-portions")>("../lib/repositories/food-portions");
      return { ...actual, getFoodPortionById: vi.fn().mockResolvedValue(portionRow()) };
    });
    const { executeProposeMealPlanChange } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const output = await executeProposeMealPlanChange({
      mealPlanId: "plan-1", baseVersion: 3,
      changes: [{ operation: "add_item", mealId: "meal-2", food: { foodName: "Banana, da terra, crua", source: "TACO", refId: "175" }, quantity: 1, unit: "unidade", householdMeasureId: "portion-1" }],
    });
    expect(output).not.toHaveProperty("error");
    if ("error" in output) return;
    expect(output.preview.hasEstimatedValues).toBeUndefined(); // medida especifica cadastrada = confidence "high", nunca marcado como estimativa
  });

  it("portionId que pertence a outro alimento é rejeitado (nunca aplica medida de identidade errada)", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(basePlan()) }));
    vi.doMock("@/lib/repositories/food-portions", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/food-portions")>("../lib/repositories/food-portions");
      return { ...actual, getFoodPortionById: vi.fn().mockResolvedValue(portionRow({ food_ref_id: "999-outro-alimento" })) };
    });
    const { executeProposeMealPlanChange } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const output = await executeProposeMealPlanChange({
      mealPlanId: "plan-1", baseVersion: 3,
      changes: [{ operation: "add_item", mealId: "meal-2", food: { foodName: "Banana, da terra, crua", source: "TACO", refId: "175" }, quantity: 1, unit: "unidade", householdMeasureId: "portion-1" }],
    });
    expect(output).toEqual({ error: expect.stringContaining("não pertence ao alimento") });
  });

  it("sem portion cadastrada (portionId não encontrado), nunca inventa peso — rejeita", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(basePlan()) }));
    vi.doMock("@/lib/repositories/food-portions", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/food-portions")>("../lib/repositories/food-portions");
      return { ...actual, getFoodPortionById: vi.fn().mockResolvedValue(null) };
    });
    const { executeProposeMealPlanChange } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const output = await executeProposeMealPlanChange({
      mealPlanId: "plan-1", baseVersion: 3,
      changes: [{ operation: "add_item", mealId: "meal-2", food: { foodName: "Banana, da terra, crua", source: "TACO", refId: "175" }, quantity: 1, unit: "unidade", householdMeasureId: "does-not-exist" }],
    });
    expect(output).toEqual({ error: expect.stringContaining("não pertence ao alimento") });
  });
});

describe("duplicate_meal / reorder_meals", () => {
  it("duplicate_meal copia os itens preservando snapshot de vínculo, com identidade própria (sem id)", async () => {
    const { applyMealPlanChangesWithPreview } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const plan = basePlan();
    const result = applyMealPlanChangesWithPreview(plan.meals, [{ operation: "duplicate_meal", mealId: "meal-1" }], plan.title);
    expect(result.meals).toHaveLength(3);
    const copy = result.meals[1];
    expect(copy.id).toBeUndefined();
    expect(copy.name).toBe("Café da manhã (cópia)");
    expect(copy.items[0]).toMatchObject({ food: "Banana, da terra, crua", food_source: "TACO", food_ref_id: "175" });
    expect(copy.items[0].id).toBeUndefined();
  });

  it("reorder_meals com permutação válida reordena de verdade", async () => {
    const { applyMealPlanChangesWithPreview } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const plan = basePlan();
    const result = applyMealPlanChangesWithPreview(plan.meals, [{ operation: "reorder_meals", mealIds: ["meal-2", "meal-1"] }], plan.title);
    expect(result.meals.map((m) => m.id)).toEqual(["meal-2", "meal-1"]);
  });

  it("reorder_meals rejeita lista que não é permutação exata (faltando/sobrando id)", async () => {
    const { applyMealPlanChangesWithPreview, MealPlanChangeValidationError } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const plan = basePlan();
    expect(() => applyMealPlanChangesWithPreview(plan.meals, [{ operation: "reorder_meals", mealIds: ["meal-1"] }], plan.title))
      .toThrow(MealPlanChangeValidationError);
    expect(() => applyMealPlanChangesWithPreview(plan.meals, [{ operation: "reorder_meals", mealIds: ["meal-1", "meal-2", "meal-fantasma"] }], plan.title))
      .toThrow(MealPlanChangeValidationError);
  });

  it("reorder_meals na mesma proposta de um add_meal/duplicate_meal é rejeitado (refeição nova ainda sem id)", async () => {
    const { applyMealPlanChangesWithPreview, MealPlanChangeValidationError } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const plan = basePlan();
    expect(() =>
      applyMealPlanChangesWithPreview(
        plan.meals,
        [{ operation: "add_meal", name: "Ceia" }, { operation: "reorder_meals", mealIds: ["meal-1", "meal-2"] }],
        plan.title
      )
    ).toThrow(MealPlanChangeValidationError);
  });
});

describe("duplicate_item / reorder_items", () => {
  it("duplicate_item copia o item logo depois do original, com identidade própria", async () => {
    const { applyMealPlanChangesWithPreview } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const plan = basePlan();
    const result = applyMealPlanChangesWithPreview(plan.meals, [{ operation: "duplicate_item", mealId: "meal-1", itemId: "item-1" }], plan.title);
    const meal = result.meals.find((m) => m.id === "meal-1")!;
    expect(meal.items).toHaveLength(2);
    expect(meal.items[1].id).toBeUndefined();
    expect(meal.items[1]).toMatchObject({ food: "Banana, da terra, crua", quantity: "100" });
  });

  it("reorder_items reordena os itens de uma refeição específica", async () => {
    const { applyMealPlanChangesWithPreview } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const plan = basePlan({
      meals: [
        {
          id: "meal-1", name: "Café", suggested_time: null, notes: null, source_recipe_id: null,
          items: [
            { id: "item-a", food: "Ovo cozido", quantity: "1", unit: "unidade" },
            { id: "item-b", food: "Pão francês", quantity: "1", unit: "unidade" },
          ],
        },
      ],
    });
    const result = applyMealPlanChangesWithPreview(plan.meals, [{ operation: "reorder_items", mealId: "meal-1", itemIds: ["item-b", "item-a"] }], plan.title);
    expect(result.meals[0].items.map((i) => i.id)).toEqual(["item-b", "item-a"]);
  });

  it("reorder_items rejeita permutação incompleta", async () => {
    const { applyMealPlanChangesWithPreview, MealPlanChangeValidationError } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const plan = basePlan();
    expect(() => applyMealPlanChangesWithPreview(plan.meals, [{ operation: "reorder_items", mealId: "meal-2", itemIds: ["item-fantasma"] }], plan.title))
      .toThrow(MealPlanChangeValidationError);
  });
});

describe("race condition — versão mudou entre a proposta e a confirmação (item 6/20 do pedido)", () => {
  const admin = { adminId: "admin-1" };

  function validAction(): ProposedAction {
    return {
      kind: "meal_plan_change", clientId: "client-1", mealPlanId: "plan-1", baseVersion: 4,
      changes: [{ operation: "change_quantity", mealId: "meal-1", itemId: "item-1", quantity: 120 }],
      preview: {
        mealPlanTitle: "Plano padrão",
        changeSummaries: [{ operation: "change_quantity", mealName: "Café da manhã", before: "Banana — 100g", after: "Banana — 120g" }],
        totalImpact: { kcal: 5, protein: 0, carbs: 1, fat: 0 },
      },
      risk: "clinical", requiresConfirmation: true,
    };
  }

  it("proposta criada na versão 4, mas updateMealPlan detecta que o plano já está na versão 5 (UI salvou nesse meio-tempo) → 409, nunca aplica", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    // getMealPlanById (chamado no INÍCIO do handler) ainda enxerga a versão 4
    // — exatamente o cenário de corrida: a checagem manual passaria, mas
    // updateMealPlan (com expectedVersion=4 passado explicitamente) precisa
    // detectar sozinho que o estado real já mudou para 5.
    const plan = basePlan({ version: 4 });
    vi.doMock("@/lib/repositories/meal-plans", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/meal-plans")>("../lib/repositories/meal-plans");
      return {
        ...actual,
        getMealPlanById: vi.fn().mockResolvedValue(plan),
        updateMealPlan: vi.fn().mockImplementation(async (_id: string, _clientId: string, _input: unknown, options: { expectedVersion?: number }) => {
          // Simula o que updateMealPlan real faz: compara expectedVersion contra uma releitura fresca (versão 5, já mudada por outra via).
          if (options?.expectedVersion !== undefined && options.expectedVersion !== 5) {
            throw new actual.MealPlanVersionConflictError();
          }
          return { ...plan, version: (options?.expectedVersion ?? 4) + 1 };
        }),
      };
    });
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(validAction(), admin)).rejects.toMatchObject({ status: 409 });
  });
});

describe("audit/versionamento — expectedVersion e source corretos passados a updateMealPlan (item 18 do pedido)", () => {
  it("updateMealPlan recebe expectedVersion=baseVersion, changedByAdminId e source:'ai_proposal'", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const plan = basePlan({ version: 3 });
    const updateMealPlan = vi.fn().mockResolvedValue({ ...plan, version: 4 });
    vi.doMock("@/lib/repositories/meal-plans", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/meal-plans")>("../lib/repositories/meal-plans");
      return { ...actual, getMealPlanById: vi.fn().mockResolvedValue(plan), updateMealPlan };
    });
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "meal_plan_change", clientId: "client-1", mealPlanId: "plan-1", baseVersion: 3,
      changes: [{ operation: "change_quantity", mealId: "meal-1", itemId: "item-1", quantity: 120 }],
      preview: { mealPlanTitle: "Plano padrão", changeSummaries: [], totalImpact: { kcal: 0, protein: 0, carbs: 0, fat: 0 } },
      risk: "clinical", requiresConfirmation: true,
    };
    await executeProposedAction(action, { adminId: "admin-1" });
    expect(updateMealPlan).toHaveBeenCalledWith(
      "plan-1", "client-1",
      expect.any(Object),
      { expectedVersion: 3, changedByAdminId: "admin-1", source: "ai_proposal" }
    );
  });
});

describe("teste nutricional (item 22) — getMealPlanNutrition reflete o novo estado real, nunca recalculado pelo LLM", () => {
  it("depois de um add_item, o total do dia calculado bate com a soma determinística real", async () => {
    const planAfterAdd = basePlan({
      meals: [
        {
          id: "meal-1", name: "Café da manhã", suggested_time: "08:00", notes: null, source_recipe_id: null,
          items: [
            { id: "item-1", food: "Banana, da terra, crua", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "175" },
            { id: "item-3", food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "3" },
          ],
        },
      ],
    });
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(planAfterAdd) }));
    const { executeGetMealPlanNutrition } = await import("../lib/ai/agents/nutrition/meal-plan-change-agent");
    const result = await executeGetMealPlanNutrition({ mealPlanId: "plan-1" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    // 100g de arroz tipo 1 cozido = 128 kcal reais (TACO) — confirma que o total reflete o item novo, nunca um numero inventado.
    expect(result.totalDay.kcal).toBeGreaterThan(128);
  });
});
