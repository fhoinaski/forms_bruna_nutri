import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * R5.1 — Clinical Copilot OPTIONS/COMBINATION/nested review. Reaproveita o
 * mesmo padrão de mock de tests/ai-meal-plan-draft-agent.test.ts (mocka
 * generateStructuredResult diretamente, sem chamar um provider real).
 * SIMPLE permanece coberto — sem regressão — por aquele arquivo; este
 * cobre só o que é novo nesta fase: geração OPTIONS/COMBINATION, resolução
 * recursiva (AUTO_MATCH/REVIEW_REQUIRED/NOT_FOUND aninhados), path estável,
 * e a IA nunca sendo autoridade também em níveis aninhados.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const client = { id: "client-1", name: "Maria Silva", birth_date: "1990-01-01" } as import("@/lib/repositories/clients").Client;

function mockCommonRepos() {
  vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(client) }));
  vi.doMock("@/lib/repositories/nutrition-records", () => ({ getExistingNutritionRecord: vi.fn().mockResolvedValue(null) }));
  vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({ listPatientClinicalMarkers: vi.fn().mockResolvedValue([]) }));
  vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(null) }));
  vi.doMock("@/lib/repositories/recipes", () => ({ getRecipes: vi.fn().mockResolvedValue([]), getRecipeById: vi.fn().mockResolvedValue(null) }));
  vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));
}

function mockCatalog(searchFoodsImpl: (args: { query: string }) => Promise<unknown[]> | unknown[]) {
  const searchFoods = vi.fn().mockImplementation(searchFoodsImpl);
  vi.doMock("@/lib/nutrition/food-catalog", () => ({
    searchFoods,
    getFoodByReference: vi.fn().mockImplementation(async ({ sourceId }: { sourceId: string }) => ({
      macroReference: { fonte: "taco", numero: Number(sourceId), descricao: `Alimento ${sourceId}`, energia_kcal: 100, proteina_g: 5, carboidrato_g: 10, lipidios_g: 2 },
    })),
  }));
  return searchFoods;
}

const baseInput = {
  clientId: "client-1",
  objectiveLabel: "Emagrecimento",
  targetEnergyKcal: null,
  targetProteinG: null,
  targetCarbohydrateG: null,
  targetFatG: null,
  prioritizeFoods: null,
  avoidFoods: null,
  useRecipes: false,
  allowFlexibleStructure: true,
};

describe("OPTIONS — alternativas completas mutuamente exclusivas (seções 5-7, 55, 64-66)", () => {
  it("gera meal_structure OPTIONS com duas opções resolvidas, cada uma com seu próprio path", async () => {
    mockCommonRepos();
    mockCatalog(({ query }) => {
      if (query.includes("ovo")) return [{ ref: { source: "TACO", sourceId: "1" }, name: "Ovo, mexido", sourceLabel: "TACO", matchRank: 0 }];
      if (query.includes("iogurte")) return [{ ref: { source: "TACO", sourceId: "2" }, name: "Iogurte, natural", sourceLabel: "TACO", matchRank: 0 }];
      return [];
    });
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockResolvedValue({
        data: {
          meals: [{
            structure: "OPTIONS",
            mealKey: "cafe_da_manha",
            options: [
              { label: "Opção A", items: [{ query: "ovo mexido", quantity: 100, unit: "g" }] },
              { label: "Opção B", items: [{ query: "iogurte natural", quantity: 170, unit: "g" }] },
            ],
          }],
        },
        provider: "test", model: "test", attempts: 1, repaired: false,
      }),
    }));

    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({ ...baseInput, requestedMeals: [{ key: "cafe_da_manha", suggestedTime: null }] });

    expect(draft.meals).toHaveLength(1);
    const meal = draft.meals[0];
    expect(meal.meal_structure).toBe("OPTIONS");
    expect(meal.items).toHaveLength(0); // sem itens fixos de nível de refeição
    expect(meal.options).toHaveLength(2);
    expect(meal.options?.[0].items[0].food_ref_id).toBe("1");
    expect(meal.options?.[1].items[0].food_ref_id).toBe("2");
    expect(meal.needsReview).toHaveLength(0);
  });

  it("item ambíguo dentro de uma opção vira REVIEW_REQUIRED com path options[N].items[M], sem afetar a outra opção", async () => {
    mockCommonRepos();
    mockCatalog(({ query }) => {
      if (query.includes("frango")) {
        return [
          { ref: { source: "TACO", sourceId: "10" }, name: "Frango, peito, cru", sourceLabel: "TACO", matchRank: 3 },
          { ref: { source: "TACO", sourceId: "11" }, name: "Frango, coxa, crua", sourceLabel: "TACO", matchRank: 3 },
        ];
      }
      if (query.includes("banana")) return [{ ref: { source: "TACO", sourceId: "20" }, name: "Banana, prata, crua", sourceLabel: "TACO", matchRank: 0 }];
      return [];
    });
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockResolvedValue({
        data: {
          meals: [{
            structure: "OPTIONS",
            mealKey: "almoco",
            options: [
              { label: "Opção A", items: [{ query: "frango", quantity: 120, unit: "g" }] },
              { label: "Opção B", items: [{ query: "banana prata", quantity: 100, unit: "g" }] },
            ],
          }],
        },
        provider: "test", model: "test", attempts: 1, repaired: false,
      }),
    }));

    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({ ...baseInput, requestedMeals: [{ key: "almoco", suggestedTime: null }] });

    const meal = draft.meals[0];
    expect(meal.options?.[0].items).toHaveLength(0);
    expect(meal.options?.[0].needsReview).toHaveLength(1);
    expect(meal.options?.[0].needsReview[0].status).toBe("AMBIGUOUS");
    expect(meal.options?.[0].needsReview[0].path).toBe("options[0].items[0]");
    expect(meal.options?.[1].items).toHaveLength(1); // opção B nunca é afetada pela ambiguidade da opção A
    expect(meal.options?.[1].needsReview).toHaveLength(0);
  });

  it("rejeita OPTIONS com só 1 alternativa (schema exige 2 a 4)", async () => {
    const { draftMealLlmSchema } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const result = draftMealLlmSchema.safeParse({
      structure: "OPTIONS", mealKey: "almoco", options: [{ label: "Única opção", items: [{ query: "arroz", quantity: 100, unit: "g" }] }],
    });
    expect(result.success).toBe(false);
  });
});

describe("COMBINATION — fixos + grupo de escolha + opcionais (seções 8-10, 56, 67-69)", () => {
  it("gera meal_structure COMBINATION com item fixo, grupo de escolha resolvido e item opcional marcado is_optional", async () => {
    mockCommonRepos();
    mockCatalog(({ query }) => {
      if (query.includes("arroz")) return [{ ref: { source: "TACO", sourceId: "1" }, name: "Arroz, branco, cozido", sourceLabel: "TACO", matchRank: 0 }];
      if (query.includes("frango grelhado")) return [{ ref: { source: "TACO", sourceId: "2" }, name: "Frango, peito, grelhado", sourceLabel: "TACO", matchRank: 0 }];
      if (query.includes("tilápia")) return [{ ref: { source: "TACO", sourceId: "3" }, name: "Tilápia, grelhada", sourceLabel: "TACO", matchRank: 0 }];
      if (query.includes("azeite")) return [{ ref: { source: "TACO", sourceId: "4" }, name: "Azeite, oliva, extra virgem", sourceLabel: "TACO", matchRank: 0 }];
      return [];
    });
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockResolvedValue({
        data: {
          meals: [{
            structure: "COMBINATION",
            mealKey: "almoco",
            fixed_items: [{ query: "arroz branco cozido", quantity: 100, unit: "g" }],
            choice_groups: [{
              title: "Proteína", min_selections: 1, max_selections: 1,
              items: [
                { query: "peito de frango grelhado", quantity: 120, unit: "g" },
                { query: "filé de tilápia grelhada", quantity: 120, unit: "g" },
              ],
            }],
            optional_items: [{ query: "azeite de oliva extra virgem", quantity: 10, unit: "ml" }],
          }],
        },
        provider: "test", model: "test", attempts: 1, repaired: false,
      }),
    }));

    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({ ...baseInput, requestedMeals: [{ key: "almoco", suggestedTime: null }] });

    const meal = draft.meals[0];
    expect(meal.meal_structure).toBe("COMBINATION");
    // items = fixed + optional combinados (mesmo array, is_optional distingue)
    expect(meal.items).toHaveLength(2);
    expect(meal.items[0].food_ref_id).toBe("1");
    expect(meal.items[0].is_optional).toBeFalsy();
    expect(meal.items[1].food_ref_id).toBe("4");
    expect(meal.items[1].is_optional).toBe(true);
    expect(meal.choice_groups).toHaveLength(1);
    expect(meal.choice_groups?.[0].items).toHaveLength(2);
    expect(meal.choice_groups?.[0].min_selections).toBe(1);
    expect(meal.choice_groups?.[0].max_selections).toBe(1);
  });

  it("item NOT_FOUND dentro de um grupo de escolha vira needsReview com path choice_groups[N].items[M]", async () => {
    mockCommonRepos();
    mockCatalog(() => []); // nada encontrado no catálogo
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockResolvedValue({
        data: {
          meals: [{
            structure: "COMBINATION",
            mealKey: "jantar",
            fixed_items: [],
            choice_groups: [{ title: "Proteína", min_selections: 1, max_selections: 1, items: [{ query: "alimento inexistente xyz", quantity: 100, unit: "g" }] }],
            optional_items: [],
          }],
        },
        provider: "test", model: "test", attempts: 1, repaired: false,
      }),
    }));

    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({ ...baseInput, requestedMeals: [{ key: "jantar", suggestedTime: null }] });

    const group = draft.meals[0].choice_groups?.[0];
    expect(group?.items).toHaveLength(0);
    expect(group?.needsReview).toHaveLength(1);
    expect(group?.needsReview[0].status).toBe("NOT_FOUND");
    expect(group?.needsReview[0].path).toBe("choice_groups[0].items[0]");
  });

  it("rejeita min_selections/max_selections inconsistentes (max < min)", async () => {
    const { draftMealLlmSchema } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const result = draftMealLlmSchema.safeParse({
      structure: "COMBINATION", mealKey: "jantar", fixed_items: [], optional_items: [],
      choice_groups: [{ title: "X", min_selections: 2, max_selections: 1, items: [{ query: "a", quantity: 1, unit: "g" }] }],
    });
    expect(result.success).toBe(false);
  });
});

describe("IA nunca é autoridade também em níveis aninhados (seções 12, 33, 59, 60)", () => {
  it("descarta food_ref_id/kcal injetado dentro de OPTIONS/COMBINATION — schema estrito rejeita antes do resolver", async () => {
    mockCommonRepos();
    mockCatalog(() => [{ ref: { source: "TACO", sourceId: "1" }, name: "Arroz, branco, cozido", sourceLabel: "TACO", matchRank: 0 }]);
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockImplementation(async ({ schema }: { schema: { safeParse: (v: unknown) => { success: boolean } } }) => {
        const injected = {
          meals: [{
            structure: "COMBINATION", mealKey: "almoco",
            fixed_items: [{ query: "arroz", quantity: 100, unit: "g", kcal: 999, canonicalFoodId: "fake-id", food_ref_id: "fake-id" }],
            choice_groups: [{ title: "X", min_selections: 1, max_selections: 1, items: [{ query: "arroz", quantity: 100, unit: "g" }] }],
            optional_items: [],
          }],
        };
        expect(schema.safeParse(injected).success).toBe(false); // extra fields (.strict()) invalidam o objeto inteiro
        return {
          data: {
            meals: [{
              structure: "COMBINATION", mealKey: "almoco",
              fixed_items: [{ query: "arroz branco cozido", quantity: 100, unit: "g" }],
              choice_groups: [{ title: "X", min_selections: 1, max_selections: 1, items: [{ query: "arroz branco cozido", quantity: 100, unit: "g" }] }],
              optional_items: [],
            }],
          },
          provider: "test", model: "test", attempts: 1, repaired: false,
        };
      }),
    }));

    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({ ...baseInput, requestedMeals: [{ key: "almoco", suggestedTime: null }] });
    // Identidade real vem só do resolver (food_ref_id "1", nunca "fake-id").
    expect(draft.meals[0].items[0].food_ref_id).toBe("1");
    expect(draft.meals[0].choice_groups?.[0].items[0].food_ref_id).toBe("1");
  });
});

describe("Resolução em lote — nunca N+1 mesmo com estrutura aninhada (seções 13, 49, 51)", () => {
  it("a mesma query repetida em fixed_items/choice_groups/optional_items só busca no catálogo uma vez", async () => {
    mockCommonRepos();
    const searchFoods = mockCatalog(() => [{ ref: { source: "TACO", sourceId: "1" }, name: "Arroz, branco, cozido", sourceLabel: "TACO", matchRank: 0 }]);
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockResolvedValue({
        data: {
          meals: [{
            structure: "COMBINATION", mealKey: "almoco",
            fixed_items: [{ query: "arroz branco cozido", quantity: 100, unit: "g" }],
            choice_groups: [{ title: "X", min_selections: 1, max_selections: 1, items: [{ query: "arroz branco cozido", quantity: 80, unit: "g" }] }],
            optional_items: [{ query: "arroz branco cozido", quantity: 50, unit: "g" }],
          }],
        },
        provider: "test", model: "test", attempts: 1, repaired: false,
      }),
    }));

    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({ ...baseInput, requestedMeals: [{ key: "almoco", suggestedTime: null }] });

    expect(searchFoods).toHaveBeenCalledTimes(1); // cache por query normalizada, mesmo cruzando fixed/choice_group/optional
    expect(draft.meals[0].items).toHaveLength(2);
    expect(draft.meals[0].choice_groups?.[0].items).toHaveLength(1);
  });
});
