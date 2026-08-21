import { describe, expect, it } from "vitest";
import { calculateRecipeNutrition, type RecipeIngredient } from "@/lib/nutrition/recipes";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";
import { estimateFoodMacros, sumMacros } from "@/lib/nutrition/macros";

// Usa um alimento real do dataset TACO (nao hardcoded), pra nao depender de
// um numero magico que pode nao existir.
const sampleFood = TACO_REFERENCES.find((food) => typeof food.numero === "number" && food.energia_kcal > 0)!;

function buildIngredients(gramsList: number[]): RecipeIngredient[] {
  return gramsList.map((grams) => ({ taco_number: sampleFood.numero as number, food_name: sampleFood.descricao, grams }));
}

describe("calculateRecipeNutrition — arredondamento (item 23 do pedido)", () => {
  it("perPortion nao e obtido dividindo o total JA arredondado (evita erro composto)", () => {
    // 3 ingredientes com gramagens que tendem a gerar frações — se o total
    // fosse arredondado antes de dividir pelas porcoes, perPortion.kcal
    // poderia divergir do valor preciso (rawTotal.kcal / servings)
    // arredondado uma unica vez.
    const ingredients = buildIngredients([37, 53, 68]);
    const servings = 3;

    const rawTotal = sumMacros(ingredients.map((ing) => estimateFoodMacros(sampleFood.descricao, ing.grams, "g", [sampleFood])));
    const expectedPerPortionKcal = Math.round(rawTotal.kcal / servings);

    const result = calculateRecipeNutrition(ingredients, servings);

    expect(result.perPortion.kcal).toBe(expectedPerPortionKcal);
  });

  it("total = soma bruta arredondada uma unica vez (nao soma valores ja arredondados por ingrediente)", () => {
    const ingredients = buildIngredients([33, 47, 91, 12]);
    const rawTotal = sumMacros(ingredients.map((ing) => estimateFoodMacros(sampleFood.descricao, ing.grams, "g", [sampleFood])));

    const result = calculateRecipeNutrition(ingredients, 1);

    expect(result.total.kcal).toBe(Math.round(rawTotal.kcal));
    expect(result.total.protein).toBe(Math.round(rawTotal.protein * 10) / 10);
  });

  it("total e perPortion sao iguais quando servings = 1", () => {
    const ingredients = buildIngredients([100, 50]);
    const result = calculateRecipeNutrition(ingredients, 1);
    expect(result.perPortion).toEqual(result.total);
  });

  it("servings invalido (0, negativo, NaN) cai para 1 em vez de dividir por zero", () => {
    const ingredients = buildIngredients([100]);
    const withZero = calculateRecipeNutrition(ingredients, 0);
    const withNegative = calculateRecipeNutrition(ingredients, -2);
    const withOne = calculateRecipeNutrition(ingredients, 1);
    expect(withZero.perPortion).toEqual(withOne.perPortion);
    expect(withNegative.perPortion).toEqual(withOne.perPortion);
    expect(Number.isFinite(withZero.perPortion.kcal)).toBe(true);
  });

  it("ingrediente sem taco_number/gramas nao quebra o calculo (fica com totalItems marcado)", () => {
    const ingredients: RecipeIngredient[] = [
      { taco_number: sampleFood.numero as number, food_name: sampleFood.descricao, grams: 100 },
      { food_name: "Alimento sem referencia", grams: null },
    ];
    const result = calculateRecipeNutrition(ingredients, 2);
    expect(result.total.totalItems).toBe(2);
    expect(result.total.recognizedItems).toBe(1);
    expect(Number.isFinite(result.total.kcal)).toBe(true);
  });
});
