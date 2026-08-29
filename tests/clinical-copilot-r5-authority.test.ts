import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * R5 (seções 15/16/51/52/69/70) — provas explícitas de que a IA nunca é
 * autoridade sobre identidade canônica ou nutrição, complementando as já
 * existentes em tests/ai-meal-plan-draft-agent.test.ts (kcal/macros
 * descartados, recipeId inventado descartado, ambíguo nunca escolhido
 * sozinho). Aqui: um `canonicalFoodId`/`food_ref_id` inventado pela IA
 * nunca sobrevive — só o resolver real (lib/nutrition/food-resolver.ts)
 * decide a identidade final.
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
}

describe("IA nunca fornece identidade canônica — só o resolver decide (seções 15/16/51/70)", () => {
  it("um food_ref_id/canonicalFoodId inventado pela IA no item é descartado pelo schema estrito (draftFoodItemSchema só tem query/quantity/unit)", async () => {
    mockCommonRepos();
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods: vi.fn().mockResolvedValue([{ ref: { source: "TACO", sourceId: "1" }, name: "Arroz, integral, cozido", sourceLabel: "TACO", matchRank: 0 }]),
      getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 1, descricao: "Arroz, integral, cozido", energia_kcal: 123, proteina_g: 2.5, carboidrato_g: 25.8, lipidios_g: 1 } }),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockImplementation(async ({ schema }: { schema: { safeParse: (v: unknown) => { success: boolean } } }) => {
        // A IA tenta "colar" uma identidade canônica inventada — o schema estrito precisa rejeitar isso.
        const attemptedInjection = { meals: [{ mealKey: "almoco", items: [{ query: "arroz integral cozido", quantity: 100, unit: "g", canonicalFoodId: "taco:9999:alucinado", food_ref_id: "9999" }] }] };
        const result = schema.safeParse(attemptedInjection);
        expect(result.success).toBe(false); // rejeitado — campo extra fora do schema
        return { data: { meals: [{ mealKey: "almoco", items: [{ query: "arroz integral cozido", quantity: 100, unit: "g" }] }] }, provider: "test", model: "test", attempts: 1, repaired: false };
      }),
    }));

    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "almoco", suggestedTime: null }], prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    });

    // A identidade final vem SÓ do resolver real (catálogo mockado acima) — nunca do "9999" inventado.
    expect(draft.meals[0].items[0].food_ref_id).toBe("1");
    expect(draft.meals[0].items[0]).not.toHaveProperty("canonicalFoodId");
  });

  it("alimento que a IA propõe mas não existe no catálogo real vira NOT_FOUND — nunca um alimento fabricado", async () => {
    mockCommonRepos();
    vi.doMock("@/lib/nutrition/food-catalog", () => ({ searchFoods: vi.fn().mockResolvedValue([]), getFoodByReference: vi.fn() }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn() }));
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({
      generateStructuredResult: vi.fn().mockResolvedValue({
        data: { meals: [{ mealKey: "almoco", items: [{ query: "alimento completamente inexistente xyz123", quantity: 100, unit: "g" }] }] },
        provider: "test", model: "test", attempts: 1, repaired: false,
      }),
    }));
    const { generateMealPlanDraft } = await import("@/lib/ai/agents/nutrition/meal-plan-draft-agent");
    const draft = await generateMealPlanDraft({
      clientId: "client-1", objectiveLabel: "x", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
      requestedMeals: [{ key: "almoco", suggestedTime: null }], prioritizeFoods: null, avoidFoods: null, useRecipes: false,
    });
    expect(draft.meals[0].items).toHaveLength(0);
    expect(draft.meals[0].needsReview[0].status).toBe("NOT_FOUND");
  });
});
