import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Gerador de pre-plano guiado por IA — prova as regras centrais do pedido:
 * a IA nunca fornece kcal/macros (schema so tem identidade), alimentos so
 * entram no rascunho via resolucao rigorosa do catalogo real
 * (lib/nutrition/food-resolver.ts — nunca "primeiro resultado" cego),
 * conflito/ambiguidade nunca entram silenciosamente no calculo (vao para
 * needsReview), refId de receita inventado e descartado, e falha do
 * provedor de IA nunca quebra silenciosamente (propaga um erro tipado que
 * a rota converte em fallback).
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const client = { id: "client-1", name: "Maria Silva", birth_date: "1990-01-01" } as import("@/lib/repositories/clients").Client;

function mockCommonRepos(overrides: {
  nutritionRecord?: unknown;
  markers?: unknown[];
  activePlan?: unknown;
  recipes?: unknown[];
} = {}) {
  vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(client) }));
  vi.doMock("@/lib/repositories/nutrition-records", () => ({ getExistingNutritionRecord: vi.fn().mockResolvedValue(overrides.nutritionRecord ?? null) }));
  vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({ listPatientClinicalMarkers: vi.fn().mockResolvedValue(overrides.markers ?? []) }));
  vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(overrides.activePlan ?? null) }));
  vi.doMock("@/lib/repositories/recipes", () => ({
    getRecipes: vi.fn().mockResolvedValue(overrides.recipes ?? []),
    getRecipeById: vi.fn().mockResolvedValue(null),
  }));
}

describe("buildMealPlanDraftContext — 100% deterministico, sem IA", () => {
  it("monta o contexto a partir dos repositorios reais, sem inventar nada ausente", async () => {
    mockCommonRepos({
      nutritionRecord: { biological_sex: "Feminino", current_weight_kg: "68,5", height_cm: "1,65", bmi: "25,2", life_stage: "Adulto", goals: null, allergies: "Amendoim", restrictions: null, food_preferences: null, food_aversions: null },
    });
    const { buildMealPlanDraftContext } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const context = await buildMealPlanDraftContext("client-1");
    expect(context?.biologicalSex).toBe("Feminino");
    expect(context?.heightDisplay).toBe("1,65 m");
    expect(context?.allergies).toBe("Amendoim");
    expect(context?.goals).toBeNull();
  });

  it("cliente inexistente retorna null, nunca lanca erro", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(null) }));
    const { buildMealPlanDraftContext } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    expect(await buildMealPlanDraftContext("missing")).toBeNull();
  });
});

describe("generateMealPlanDraft — a IA nunca fornece kcal/macros, so identidade", () => {
  it("schema estrito descarta campos numericos de nutriente que a IA tente injetar", async () => {
    mockCommonRepos();
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods: vi.fn().mockResolvedValue([{ ref: { source: "TACO", sourceId: "1" }, name: "Arroz, integral, cozido", sourceLabel: "TACO", matchRank: 0 }]),
      getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 1, descricao: "Arroz, integral, cozido", energia_kcal: 123, proteina_g: 2.5, carboidrato_g: 25.8, lipidios_g: 1 } }),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));
    // Payload malicioso/alucinado tentando incluir kcal — o parse .strict() do schema deve rejeitar/descartar antes de chegar no resolver.
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockImplementation(async ({ schema }: { schema: { safeParse: (v: unknown) => { success: boolean } } }) => {
        const attemptedInjection = { meals: [{ mealKey: "almoco", items: [{ query: "arroz integral cozido", quantity: 100, unit: "g", kcal: 999, proteinG: 999 }] }] };
        const result = schema.safeParse(attemptedInjection);
        expect(result.success).toBe(false); // schema estrito rejeita campo extra kcal — prova de que a IA nao pode "colar" um numero de nutriente
        return { data: { meals: [{ mealKey: "almoco", items: [{ query: "arroz integral cozido", quantity: 100, unit: "g" }] }] }, provider: "test", model: "test", attempts: 1, repaired: false };
      }),
    }));

    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({
      clientId: "client-1",
      objectiveLabel: "Emagrecimento",
      targetEnergyKcal: null,
      targetProteinG: null,
      targetCarbohydrateG: null,
      targetFatG: null,
      requestedMeals: [{ key: "almoco", suggestedTime: null }],
      prioritizeFoods: null,
      avoidFoods: null,
      useRecipes: false,
    });
    expect(draft.meals).toHaveLength(1);
    expect(draft.meals[0].items[0].food_source).toBe("TACO");
    expect(draft.meals[0].items[0].food_ref_id).toBe("1");
    expect(draft.meals[0].needsReview).toHaveLength(0);
    // O item resolvido nunca carrega um campo de kcal/macro — so identidade+quantidade.
    expect(draft.meals[0].items[0]).not.toHaveProperty("kcal");
  });

  it("ignora refeicao que a IA propos fora do que foi solicitado", async () => {
    mockCommonRepos();
    vi.doMock("@/lib/nutrition/food-catalog", () => ({ searchFoods: vi.fn().mockResolvedValue([]), getFoodByReference: vi.fn() }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn() }));
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockResolvedValue({
        data: { meals: [{ mealKey: "ceia", items: [{ query: "cha", quantity: 200, unit: "ml" }] }] },
        provider: "test", model: "test", attempts: 1, repaired: false,
      }),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "almoco", suggestedTime: null }], // ceia NAO foi solicitada
      prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    });
    expect(draft.meals).toHaveLength(0);
  });

  it("alimento em conflito com restricao clinica NUNCA entra no calculo — vai para needsReview, nao é descartado silenciosamente", async () => {
    mockCommonRepos({ markers: [{ id: "m1", type: "ALLERGY", normalized_code: "amendoim", status: "ACTIVE", severity: "SEVERE" }] });
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods: vi.fn().mockResolvedValue([{ ref: { source: "TACO", sourceId: "99" }, name: "Amendoim torrado", sourceLabel: "TACO", matchRank: 0 }]),
      getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 99, descricao: "Amendoim torrado", energia_kcal: 500, proteina_g: 20, carboidrato_g: 20, lipidios_g: 40 } }),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({
      checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "conflict", conflicts: [{ markerId: "m1", type: "ALLERGY", normalizedCode: "amendoim", label: "Amendoim", severity: "SEVERE", foodMarker: "amendoim", relation: "contains" }] }),
    }));
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockResolvedValue({
        data: { meals: [{ mealKey: "lanche_tarde", items: [{ query: "amendoim torrado", quantity: 30, unit: "g" }] }] },
        provider: "test", model: "test", attempts: 1, repaired: false,
      }),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "lanche_tarde", suggestedTime: null }], prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    });
    expect(draft.meals).toHaveLength(1);
    expect(draft.meals[0].items).toHaveLength(0); // nunca entra no calculo
    expect(draft.meals[0].needsReview).toHaveLength(1);
    expect(draft.meals[0].needsReview[0].status).toBe("CLINICAL_CONFLICT");
  });

  it("alimento ambíguo (dois cortes de frango, sem match claro) vai para needsReview com candidatos, nunca escolhe um sozinho", async () => {
    mockCommonRepos();
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods: vi.fn().mockResolvedValue([
        { ref: { source: "TACO", sourceId: "10" }, name: "Frango, peito, sem pele, cru", sourceLabel: "TACO", matchRank: 2 },
        { ref: { source: "TACO", sourceId: "11" }, name: "Frango, coxa, com pele, crua", sourceLabel: "TACO", matchRank: 2 },
      ]),
      getFoodByReference: vi.fn(),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn() }));
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockResolvedValue({
        data: { meals: [{ mealKey: "almoco", items: [{ query: "frango", quantity: 120, unit: "g" }] }] },
        provider: "test", model: "test", attempts: 1, repaired: false,
      }),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "almoco", suggestedTime: null }], prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    });
    expect(draft.meals[0].items).toHaveLength(0);
    expect(draft.meals[0].needsReview[0].status).toBe("AMBIGUOUS");
    expect(draft.meals[0].needsReview[0].candidates).toHaveLength(2);
  });

  it("recipeId inventado/inexistente e descartado, nunca aceito", async () => {
    mockCommonRepos({ recipes: [{ id: "real-recipe-1", title: "Receita Real", meal_group: "almoco", servings: 2, ingredients: [{ taco_number: 1, food_name: "Arroz", grams: 200 }] }] });
    vi.doMock("@/lib/nutrition/food-catalog", () => ({ searchFoods: vi.fn().mockResolvedValue([]), getFoodByReference: vi.fn() }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn() }));
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockResolvedValue({
        data: { meals: [{ mealKey: "almoco", recipeId: "id-que-nao-existe", items: [] }] },
        provider: "test", model: "test", attempts: 1, repaired: false,
      }),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "almoco", suggestedTime: null }], prioritizeFoods: null, avoidFoods: null, useRecipes: true,
    });
    expect(draft.meals).toHaveLength(0);
    expect(draft.warnings.some((w) => w.message.includes("não encontrada"))).toBe(true);
  });

  it("falha do provedor de IA propaga um erro tipado (nunca retorna um rascunho inventado)", async () => {
    mockCommonRepos();
    const { AiConfigError } = await import("@/lib/ai/core/ai-errors");
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({ generateStructuredResult: vi.fn().mockRejectedValue(new AiConfigError("sem chave")) }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    await expect(generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "almoco", suggestedTime: null }], prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    })).rejects.toBeInstanceOf(AiConfigError);
  });

  it("a mesma query em duas refeições diferentes só busca no catálogo uma vez (evita N+1)", async () => {
    mockCommonRepos();
    const searchFoods = vi.fn().mockResolvedValue([{ ref: { source: "TACO", sourceId: "1" }, name: "Arroz, integral, cozido", sourceLabel: "TACO", matchRank: 0 }]);
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods,
      getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 1, descricao: "Arroz, integral, cozido", energia_kcal: 123, proteina_g: 2.5, carboidrato_g: 25.8, lipidios_g: 1 } }),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockResolvedValue({
        data: {
          meals: [
            { mealKey: "cafe_da_manha", items: [{ query: "arroz integral cozido", quantity: 100, unit: "g" }] },
            { mealKey: "jantar", items: [{ query: "arroz integral cozido", quantity: 150, unit: "g" }] },
          ],
        },
        provider: "test", model: "test", attempts: 1, repaired: false,
      }),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "cafe_da_manha", suggestedTime: null }, { key: "jantar", suggestedTime: null }], prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    });
    expect(searchFoods).toHaveBeenCalledTimes(1);
    expect(draft.meals).toHaveLength(2);
    expect(draft.meals[0].items[0].quantity).toBe("100");
    expect(draft.meals[1].items[0].quantity).toBe("150");
  });
});

describe("robustez de structured output — recuperação inteligente sem afrouxar o schema", () => {
  function mockFoodResolution() {
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods: vi.fn().mockResolvedValue([{ ref: { source: "TACO", sourceId: "1" }, name: "Arroz, integral, cozido", sourceLabel: "TACO", matchRank: 0 }]),
      getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 1, descricao: "Arroz, integral, cozido", energia_kcal: 123, proteina_g: 2.5, carboidrato_g: 25.8, lipidios_g: 1 } }),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));
  }

  it("aceita quantity como string estritamente numérica ('100' → 100) via normalização mecânica pré-zod", async () => {
    mockCommonRepos();
    mockFoodResolution();
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockImplementation(async (options: { normalize?: (raw: unknown) => unknown; schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } } }) => {
        const raw = { meals: [{ mealKey: "almoco", items: [{ query: "arroz integral cozido", quantity: "100", unit: "g" }] }] };
        const normalized = options.normalize ? options.normalize(raw) : raw;
        const parsed = options.schema.safeParse(normalized);
        expect(parsed.success).toBe(true); // "100" (string estritamente numérica) foi convertida — nunca ficaria assim sem normalize
        return { data: parsed.data, provider: "test", model: "test", attempts: 1, repaired: false };
      }),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "almoco", suggestedTime: null }], prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    });
    expect(draft.meals[0].items[0].quantity).toBe("100");
  });

  it("REJEITA quantity ambígua ('100g'/'uma porção') — nunca adivinha, deixa falhar no zod normalmente", async () => {
    mockCommonRepos();
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockImplementation(async (options: { normalize?: (raw: unknown) => unknown; schema: { safeParse: (v: unknown) => { success: boolean } } }) => {
        const raw = { meals: [{ mealKey: "almoco", items: [{ query: "arroz", quantity: "100g", unit: "g" }] }] };
        const normalized = options.normalize ? options.normalize(raw) : raw;
        const parsed = options.schema.safeParse(normalized);
        expect(parsed.success).toBe(false); // "100g" continua inválido de propósito — normalização é só mecânica, nunca adivinha
        return { data: { meals: [] }, provider: "test", model: "test", attempts: 1, repaired: false };
      }),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "almoco", suggestedTime: null }], prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    });
  });

  it("recuperação parcial: 3 refeições válidas + 1 inválida no mesmo envelope → mantém as 3, nunca joga tudo fora", async () => {
    mockCommonRepos();
    mockFoodResolution();
    const { AiValidationError } = await import("@/lib/ai/core/ai-errors");
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockRejectedValue(
        new AiValidationError(
          "A IA nao retornou um resultado no formato esperado.",
          [{ path: ["meals", 2, "mealKey"], code: "invalid_value" }],
          "structured_invalid",
          false,
          "INVALID_ENUM",
          {
            meals: [
              { mealKey: "cafe_da_manha", items: [{ query: "arroz integral cozido", quantity: 100, unit: "g" }] },
              { mealKey: "almoco", items: [{ query: "arroz integral cozido", quantity: 150, unit: "g" }] },
              { mealKey: "chave_invalida_que_nao_existe", items: [{ query: "arroz integral cozido", quantity: 100, unit: "g" }] },
              { mealKey: "jantar", items: [{ query: "arroz integral cozido", quantity: 120, unit: "g" }] },
            ],
          }
        )
      ),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [
        { key: "cafe_da_manha", suggestedTime: null },
        { key: "almoco", suggestedTime: null },
        { key: "lanche_tarde", suggestedTime: null },
        { key: "jantar", suggestedTime: null },
      ],
      prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    });
    expect(draft.meals.map((m) => m.mealKey).sort()).toEqual(["almoco", "cafe_da_manha", "jantar"]);
    expect(draft.warnings.some((w) => w.message.includes("formato inválido"))).toBe(true);
  });

  it("fallback refeição-por-refeição: envelope inteiro falha sem payload recuperável, mas cada refeição isolada tem sucesso", async () => {
    mockCommonRepos();
    mockFoodResolution();
    const { AiValidationError } = await import("@/lib/ai/core/ai-errors");
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockImplementation(async (options: { prompt: string }) => {
        const asksBoth = options.prompt.includes("cafe_da_manha") && options.prompt.includes("jantar");
        if (asksBoth) {
          // Chamada do plano completo: falha sem JSON válido nenhum (ex.: resposta vazia) — nada pra recuperação parcial.
          throw new AiValidationError("A IA nao retornou um resultado no formato esperado.", undefined, "structured_invalid", false, "EMPTY_RESPONSE", undefined);
        }
        const mealKey = options.prompt.includes("cafe_da_manha") ? "cafe_da_manha" : "jantar";
        return { data: { meals: [{ mealKey, items: [{ query: "arroz integral cozido", quantity: 100, unit: "g" }] }] }, provider: "test", model: "test", attempts: 1, repaired: false };
      }),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "cafe_da_manha", suggestedTime: null }, { key: "jantar", suggestedTime: null }],
      prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    });
    expect(draft.meals.map((m) => m.mealKey).sort()).toEqual(["cafe_da_manha", "jantar"]);
  });

  it("forceMealByMeal pula direto pro fallback, sem tentar o plano completo primeiro", async () => {
    mockCommonRepos();
    mockFoodResolution();
    const generateStructuredResult = vi.fn().mockImplementation(async (options: { prompt: string }) => {
      const mealKey = options.prompt.includes("almoco") ? "almoco" : "jantar";
      return { data: { meals: [{ mealKey, items: [{ query: "arroz integral cozido", quantity: 100, unit: "g" }] }] }, provider: "test", model: "test", attempts: 1, repaired: false };
    });
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({ generateStructuredResult }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "almoco", suggestedTime: null }, { key: "jantar", suggestedTime: null }],
      prioritizeFoods: null, avoidFoods: null, useRecipes: false,
      forceMealByMeal: true,
    });
    expect(generateStructuredResult).toHaveBeenCalledTimes(2); // nunca tentou o plano completo (seria 1 chamada a mais)
    expect(draft.meals.map((m) => m.mealKey).sort()).toEqual(["almoco", "jantar"]);
  });

  it("1 única refeição solicitada: se falhar, propaga o erro em vez de 'fallback' pra si mesma", async () => {
    mockCommonRepos();
    const { AiValidationError } = await import("@/lib/ai/core/ai-errors");
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockRejectedValue(new AiValidationError("x", undefined, "structured_invalid", false, "EMPTY_RESPONSE", undefined)),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    await expect(generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "almoco", suggestedTime: null }], prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    })).rejects.toMatchObject({ name: "AiValidationError" });
  });

  it("unidade normalizada por mapa fechado ('gramas' → 'g'), sem inventar peso de medida caseira", async () => {
    mockCommonRepos();
    mockFoodResolution();
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockResolvedValue({
        data: { meals: [{ mealKey: "almoco", items: [{ query: "arroz integral cozido", quantity: 100, unit: "gramas" }] }] },
        provider: "test", model: "test", attempts: 1, repaired: false,
      }),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "almoco", suggestedTime: null }], prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    });
    expect(draft.meals[0].items[0].unit).toBe("g");
  });
});

describe("applyDraftOperations — refinamento em memoria, puro (nunca toca o plano real)", () => {
  const baseMeals = [
    { mealKey: "almoco" as const, name: "Almoço", suggested_time: null, source_recipe_id: null, needsReview: [], items: [{ food: "Arroz", displayName: "Arroz", quantity: "100", unit: "g", food_source: "TACO" as const, food_ref_id: "1", ai_suggested: true as const }] },
  ];

  it("remove_item remove exatamente o item indicado", async () => {
    mockCommonRepos();
    const { applyDraftOperations } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const result = await applyDraftOperations(baseMeals, [{ operation: "remove_item", mealIndex: 0, itemIndex: 0 }], []);
    expect(result.meals[0].items).toHaveLength(0);
    // Nao mutou o array original.
    expect(baseMeals[0].items).toHaveLength(1);
  });

  it("change_quantity altera so a quantidade, mantem identidade do alimento", async () => {
    mockCommonRepos();
    const { applyDraftOperations } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const result = await applyDraftOperations(baseMeals, [{ operation: "change_quantity", mealIndex: 0, itemIndex: 0, quantity: 250 }], []);
    expect(result.meals[0].items[0].quantity).toBe("250");
    expect(result.meals[0].items[0].food_ref_id).toBe("1");
  });

  it("indice fora do intervalo gera aviso e e ignorado, nunca lanca excecao", async () => {
    mockCommonRepos();
    const { applyDraftOperations } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const result = await applyDraftOperations(baseMeals, [{ operation: "remove_item", mealIndex: 0, itemIndex: 99 }], []);
    expect(result.meals[0].items).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("remove_meal remove a refeicao inteira", async () => {
    mockCommonRepos();
    const { applyDraftOperations } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const result = await applyDraftOperations(baseMeals, [{ operation: "remove_meal", mealIndex: 0 }], []);
    expect(result.meals).toHaveLength(0);
  });

  it("change_time altera só o horário sugerido", async () => {
    mockCommonRepos();
    const { applyDraftOperations } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const result = await applyDraftOperations(baseMeals, [{ operation: "change_time", mealIndex: 0, suggestedTime: "12:30" }], []);
    expect(result.meals[0].suggested_time).toBe("12:30");
    expect(result.meals[0].items[0].food_ref_id).toBe("1"); // resto do item intocado
  });
});

describe("paridade: rascunho da IA -> engine central == editor == impressao", () => {
  it("item resolvido pelo wizard (food_source+food_ref_id real) calcula kcal/macros pela MESMA engine usada pelo editor/impressao", async () => {
    // Nao mocka o catalogo nem o motor aqui: usa TACO_REFERENCES real e
    // calculatePlanNutrients real (a mesma funcao que app/dashboard/clients/
    // [id]/print/page.tsx e o editor usam) para provar que a identidade
    // resolvida pelo agente (food_source/food_ref_id) e suficiente pra
    // engine calcular um resultado real — nunca um numero vindo da IA.
    vi.resetModules();
    const { TACO_REFERENCES } = await import("@/lib/nutrition/taco");
    const { calculatePlanNutrients } = await import("@/lib/nutrition/nutrients");
    const sample = TACO_REFERENCES.find((food) => typeof food.numero === "number" && food.energia_kcal > 0)!;

    // Simula exatamente o formato de item que generateMealPlanDraft produz.
    const draftItem = {
      id: "item-1",
      food: sample.descricao,
      quantity: "150",
      unit: "g",
      food_source: "TACO" as const,
      food_ref_id: String(sample.numero),
    };
    const plan = { meals: [{ id: "meal-1", name: "Almoço", items: [draftItem] }] };
    const lookup = { byTacoNumber: (n: string) => TACO_REFERENCES.find((f) => String(f.numero) === n) ?? null, byCustomId: () => null, fuzzyMatch: () => null };

    const result = calculatePlanNutrients(plan, lookup);
    expect(result.perMeal[0].values.energyKcal).not.toBeNull();
    expect(result.perMeal[0].values.energyKcal).toBeGreaterThan(0);
    expect(result.quality.unresolved).toBe(0);
    // 150g = 1.5x a base de 100g da referencia.
    expect(result.perMeal[0].values.energyKcal).toBeCloseTo(sample.energia_kcal * 1.5, 1);
  });
});

describe("orçamento de tempo/tokens da geração — regressão do bug real de 502 por timeout", () => {
  it("generateMealPlanDraft usa um timeout/maxOutputTokens maior que o default do gateway (proposta completa é uma saída grande)", async () => {
    // Bug real observado em teste manual: com o default do gateway (15s
    // TOTAIS compartilhados entre as 3 tentativas, 1024 tokens), gerar ate
    // 8 refeicoes x 8 itens estourava o timeout antes de qualquer tentativa
    // terminar, sempre falhando com 502 "provedor indisponivel" mesmo com
    // um provider saudavel. Trava esses valores pra nao regredir em silencio.
    mockCommonRepos();
    let capturedOptions: { maxOutputTokens?: number; timeoutMs?: number } = {};
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockImplementation(async (options: { maxOutputTokens?: number; timeoutMs?: number }) => {
        capturedOptions = options;
        return { data: { meals: [] }, provider: "test", model: "test", attempts: 1, repaired: false };
      }),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "almoco", suggestedTime: null }], prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    });
    expect(capturedOptions.maxOutputTokens).toBeGreaterThanOrEqual(3000);
    expect(capturedOptions.timeoutMs).toBeGreaterThanOrEqual(30_000);
  });
});

describe("Food-First Meal Plan V1 — alimentos individuais são o padrão, receita é opt-in explícito", () => {
  it('useRecipes=false (padrão do wizard/chat): nunca busca receitas candidatas, e o prompt diz explicitamente "não use recipeId"', async () => {
    mockCommonRepos();
    let capturedSystem = "";
    let capturedPrompt = "";
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockImplementation(async (options: { system: string; prompt: string }) => {
        capturedSystem = options.system;
        capturedPrompt = options.prompt;
        return { data: { meals: [] }, provider: "test", model: "test", attempts: 1, repaired: false };
      }),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "cafe_da_manha", suggestedTime: null }], prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    });
    // "recipes" nunca é chamado quando useRecipes é false — candidateRecipesForMeals
    // só roda com useRecipes:true (custo zero de rede/prompt no caminho padrão).
    const recipesModule = await import("@/lib/repositories/recipes");
    expect(recipesModule.getRecipes).not.toHaveBeenCalled();
    expect(capturedPrompt).toContain("Nenhuma receita disponível — não use recipeId.");
    expect(capturedSystem).toContain("PRIORIDADE É");
  });

  it("useRecipes=true: busca receitas candidatas, mas o prompt continua instruindo a priorizar itens simples sobre recipeId", async () => {
    mockCommonRepos({ recipes: [{ id: "r1", title: "Panqueca proteica", meal_group: "cafe_da_manha" }] });
    let capturedPrompt = "";
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockImplementation(async (options: { prompt: string }) => {
        capturedPrompt = options.prompt;
        return { data: { meals: [] }, provider: "test", model: "test", attempts: 1, repaired: false };
      }),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "cafe_da_manha", suggestedTime: null }], prioritizeFoods: null, avoidFoods: null, useRecipes: true,
    });
    const recipesModule = await import("@/lib/repositories/recipes");
    expect(recipesModule.getRecipes).toHaveBeenCalled();
    expect(capturedPrompt).toContain("Panqueca proteica");
  });

  it("executeGenerateMealPlanDraft (tool do assistente de chat): useRecipes omitido pela IA vira false, nunca true por padrão", async () => {
    mockCommonRepos();
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockResolvedValue({ data: { meals: [] }, provider: "test", model: "test", attempts: 1, repaired: false }),
    }));
    const recipesModule = await import("@/lib/repositories/recipes");
    const getRecipesSpy = vi.mocked(recipesModule.getRecipes);
    const { executeGenerateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    await executeGenerateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x",
      requestedMeals: [{ key: "cafe_da_manha", suggestedTime: null }],
    });
    // Sem useRecipes explícito, getRecipes (candidateRecipesForMeals) nunca é chamado.
    expect(getRecipesSpy).not.toHaveBeenCalled();
  });
});
