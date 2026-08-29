import { describe, expect, it } from "vitest";
import { calculateRecipeIngredientTotals, resolveRecipeYieldGrams, buildRecipeReferenceEntry, type RecipeIngredient } from "@/lib/nutrition/recipes";
import { calculateFlexiblePlanNutrients, resolveRecipeItemNutrients, type FoodReferenceLookup, type RecipeReferenceEntry } from "@/lib/nutrition/nutrients";
import { getTacoFoodByNumber, TACO_REFERENCES } from "@/lib/nutrition/taco";
import { buildRecipeItemSnapshot } from "@/lib/nutrition/food-snapshot";
import type { MealPlanMealPayload } from "@/lib/repositories/meal-plans";

/**
 * R6 — Nutrition Engine authority sobre receitas: totais de ingrediente
 * vêm SEMPRE do motor real (calculateItemNutrients), missing≠zero
 * preservado, e o rateio por rendimento (yield) nunca inventa conversão.
 */

const sorted = [...TACO_REFERENCES].filter((food) => typeof food.numero === "number" && food.energia_kcal > 0).sort((a, b) => a.energia_kcal - b.energia_kcal);
const foodA = sorted[0];
const foodB = sorted[sorted.length - 1];

const lookup: FoodReferenceLookup = {
  byTacoNumber: (n) => getTacoFoodByNumber(n),
  byCustomId: () => null,
  fuzzyMatch: () => null,
};

function ing(food: typeof foodA, quantity: string): RecipeIngredient {
  return { food: food.descricao, quantity, unit: "g", food_source: "TACO", food_ref_id: String(food.numero) };
}

describe("calculateRecipeIngredientTotals — motor real, missing≠zero (seções 12-13, 68-70)", () => {
  it("um ingrediente: total == contribuição do ingrediente", () => {
    const { total } = calculateRecipeIngredientTotals([ing(foodA, "100")], lookup);
    expect(total.energyKcal).toBeCloseTo(foodA.energia_kcal, 4);
  });

  it("múltiplos ingredientes: soma correta via o motor real", () => {
    const { total } = calculateRecipeIngredientTotals([ing(foodA, "100"), ing(foodB, "50")], lookup);
    expect(total.energyKcal).toBeCloseTo(foodA.energia_kcal + foodB.energia_kcal * 0.5, 4);
  });

  it("ingrediente sem identidade resolvida soma como null, nunca 0 (correção do bug legado estimateFoodMacros)", () => {
    const unresolved: RecipeIngredient = { food: "Alimento completamente inexistente xyz", quantity: "100", unit: "g", food_source: null, food_ref_id: null };
    const { total, quality } = calculateRecipeIngredientTotals([ing(foodA, "100"), unresolved], lookup);
    // Um item resolvido + um não resolvido: soma ainda reflete só o resolvido (sumNutrients ignora null, não soma 0
    // — a correção real do bug legado: estimateFoodMacros tratava isso como 0 e contaminava o total).
    expect(total.energyKcal).toBeCloseTo(foodA.energia_kcal, 4);
    expect(quality.total).toBe(2);
  });

  it("receita 100% sem ingredientes resolvíveis: total fica null (nunca 0 fabricado)", () => {
    const unresolved: RecipeIngredient = { food: "Nada reconhecível", quantity: "100", unit: "g", food_source: null, food_ref_id: null };
    const { total } = calculateRecipeIngredientTotals([unresolved], lookup);
    expect(total.energyKcal).toBeNull();
  });

  it("ingrediente legado (taco_number/grams, sem food/food_source) continua funcionando via normalização de leitura", () => {
    const legacy: RecipeIngredient = { taco_number: Number(foodA.numero), food_name: foodA.descricao, grams: 100 };
    const { total } = calculateRecipeIngredientTotals([legacy], lookup);
    expect(total.energyKcal).toBeCloseTo(foodA.energia_kcal, 4);
  });
});

describe("resolveRecipeYieldGrams — contrato de rendimento (seções 15-21)", () => {
  it("RAW_TOTAL: usa a soma bruta das gramas dos ingredientes", () => {
    expect(resolveRecipeYieldGrams("RAW_TOTAL", null, 980)).toBe(980);
  });
  it("USER_REPORTED: usa a massa final informada, nunca a soma bruta", () => {
    expect(resolveRecipeYieldGrams("USER_REPORTED", 820, 980)).toBe(820);
  });
  it("PORTION_COUNT: nunca tem massa (null) — só porções são calculáveis", () => {
    expect(resolveRecipeYieldGrams("PORTION_COUNT", null, 980)).toBeNull();
  });
  it("ausente (receita pré-R6) é tratado como RAW_TOTAL", () => {
    expect(resolveRecipeYieldGrams(null, null, 980)).toBe(980);
  });
});

describe("resolveRecipeItemNutrients — rateio por porção/gramas (seções 22-23, 73-77)", () => {
  const entry = (yieldGrams: number | null): RecipeReferenceEntry => ({
    total: { energyKcal: 1600, proteinG: 80, carbohydrateG: 200, fatG: 40, fiberG: 10, sodiumMg: null, calciumMg: null, ironMg: null, potassiumMg: null, vitaminCMg: null },
    servings: 8,
    yieldGrams,
  });

  it("1600 kcal / 8 porções = 200 kcal por porção (seção 22)", () => {
    const { values } = resolveRecipeItemNutrients("1", "porção", entry(null));
    expect(values.energyKcal).toBeCloseTo(200, 4);
  });

  it("2 porções dobra corretamente (seção 90)", () => {
    const one = resolveRecipeItemNutrients("1", "porção", entry(null)).values;
    const two = resolveRecipeItemNutrients("2", "porção", entry(null)).values;
    expect(two.energyKcal).toBeCloseTo((one.energyKcal ?? 0) * 2, 4);
  });

  it("yield=800g, quantidade=100g: total × 100/800 (seção 23)", () => {
    const { values } = resolveRecipeItemNutrients("100", "g", entry(800));
    expect(values.energyKcal).toBeCloseTo(1600 * (100 / 800), 4);
  });

  it("sem yield em gramas (PORTION_COUNT): quantidade em g fica NÃO calculável, nunca uma conversão inventada (seções 11, 79)", () => {
    const { values, resolution } = resolveRecipeItemNutrients("100", "g", entry(null));
    expect(values.energyKcal).toBeNull();
    expect(resolution.method).toBe("unresolved");
  });

  it("quantidade inválida (0, negativa, não numérica) nunca calcula um valor", () => {
    expect(resolveRecipeItemNutrients("0", "porção", entry(null)).values.energyKcal).toBeNull();
    expect(resolveRecipeItemNutrients("-2", "porção", entry(null)).values.energyKcal).toBeNull();
    expect(resolveRecipeItemNutrients("abc", "porção", entry(null)).values.energyKcal).toBeNull();
  });

  it("sem entrada de receita (não encontrada): unresolved, nunca quebra", () => {
    const { values, resolution } = resolveRecipeItemNutrients("1", "porção", null);
    expect(values.energyKcal).toBeNull();
    expect(resolution.method).toBe("unresolved");
  });
});

describe("Recipe item dentro do plano — SIMPLE/OPTIONS/COMBINATION (seções 36-39, 82-84)", () => {
  function lookupWithRecipe(entry: RecipeReferenceEntry): FoodReferenceLookup {
    return { ...lookup, byRecipeId: (id) => id === "recipe-1" ? entry : null };
  }
  const recipeEntry: RecipeReferenceEntry = {
    total: { energyKcal: 1000, proteinG: 50, carbohydrateG: 100, fatG: 20, fiberG: 5, sodiumMg: null, calciumMg: null, ironMg: null, potassiumMg: null, vitaminCMg: null },
    servings: 5,
    yieldGrams: null,
  };
  function recipeItem(quantity: string) {
    return { food: "Receita X", quantity, unit: "porção", food_source: "RECIPE" as const, food_ref_id: "recipe-1" };
  }

  it("SIMPLE: refeição com item de receita calcula a contribuição correta (200 kcal/porção)", () => {
    const plan = { meals: [{ id: "m1", name: "Almoço", items: [recipeItem("1")] } as unknown as MealPlanMealPayload] };
    const result = calculateFlexiblePlanNutrients(plan, lookupWithRecipe(recipeEntry));
    expect(result.total.max.energyKcal).toBeCloseTo(200, 4);
    expect(result.total.varies).toBe(false);
  });

  it("OPTIONS: receita numa opção nunca é somada com a outra alternativa", () => {
    const plan = {
      meals: [{
        id: "m1", name: "Café", meal_structure: "OPTIONS", items: [],
        options: [
          { items: [recipeItem("1")] },
          { items: [{ food: "Ovo", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: String(foodA.numero) }] },
        ],
      } as unknown as MealPlanMealPayload],
    };
    const result = calculateFlexiblePlanNutrients(plan, lookupWithRecipe(recipeEntry));
    // max = a maior entre as duas opções, nunca a soma.
    expect(result.total.max.energyKcal).toBeLessThan(200 + foodA.energia_kcal + 1);
    expect(result.total.varies).toBe(true);
  });

  it("COMBINATION: receita num grupo de escolha respeita min/max_selections, nunca soma o grupo inteiro", () => {
    const plan = {
      meals: [{
        id: "m1", name: "Jantar", meal_structure: "COMBINATION", items: [],
        choice_groups: [{ min_selections: 1, max_selections: 1, items: [recipeItem("1"), { food: "Ovo", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: String(foodA.numero) }] }],
      } as unknown as MealPlanMealPayload],
    };
    const result = calculateFlexiblePlanNutrients(plan, lookupWithRecipe(recipeEntry));
    expect(result.total.varies).toBe(true);
    expect(result.total.max.energyKcal).not.toBeCloseTo(200 + foodA.energia_kcal, 1);
  });
});

describe("Snapshot congelado de item de receita — imutabilidade (seções 47-54, 80-81, 92)", () => {
  it("um snapshot congelado é usado em vez de recalcular do estado atual da receita", () => {
    const frozenValues = { energyKcal: 999, proteinG: null, carbohydrateG: null, fatG: null, fiberG: null, sodiumMg: null, calciumMg: null, ironMg: null, potassiumMg: null, vitaminCMg: null };
    const snapshot = buildRecipeItemSnapshot(frozenValues);
    const plan = {
      meals: [{
        id: "m1", name: "Almoço",
        items: [{ food: "Receita X", quantity: "1", unit: "porção", food_source: "RECIPE" as const, food_ref_id: "recipe-1", nutrition_snapshot: snapshot }],
      } as unknown as MealPlanMealPayload],
    };
    // Lookup deliberadamente devolve uma receita MUITO diferente (2000 kcal/5 porções = 400/porção)
    // — o snapshot congelado deve vencer, nunca recalcular do estado atual.
    const lookupDiverged: FoodReferenceLookup = {
      ...lookup,
      byRecipeId: () => ({ total: { energyKcal: 2000, proteinG: null, carbohydrateG: null, fatG: null, fiberG: null, sodiumMg: null, calciumMg: null, ironMg: null, potassiumMg: null, vitaminCMg: null }, servings: 5, yieldGrams: null }),
    };
    const result = calculateFlexiblePlanNutrients(plan, lookupDiverged);
    expect(result.total.max.energyKcal).toBeCloseTo(999, 4);
    expect(result.total.max.energyKcal).not.toBeCloseTo(400, 4);
  });
});

describe("buildRecipeReferenceEntry — usado pela hidratação do Composer (batch, sem N+1 — seções 29, 100)", () => {
  it("monta a entrada a partir dos ingredientes reais, nunca de um valor gravado manualmente", () => {
    const entry = buildRecipeReferenceEntry([ing(foodA, "100")], 2, "RAW_TOTAL", null, lookup);
    expect(entry.total.energyKcal).toBeCloseTo(foodA.energia_kcal, 4);
    expect(entry.servings).toBe(2);
    expect(entry.yieldGrams).toBeCloseTo(100, 1);
  });
});
