import { describe, expect, it } from "vitest";
import { scaleRecipeIngredientsToPortions, calculateRecipeNutrition } from "@/lib/nutrition/recipes";
import { calculateItemNutrients, resolveItemReference, type FoodReferenceLookup } from "@/lib/nutrition/nutrients";
import { getTacoFoodByNumber, TACO_REFERENCES } from "@/lib/nutrition/taco";

/**
 * Bug relatado: inserir uma receita de N porções copiava as gramas do LOTE
 * INTEIRO (cadastradas para o rendimento total) na refeição, fazendo o
 * motor calcular e a impressão mostrar o total da receita inteira (ex.:
 * 1510 kcal) como se fosse a porção prescrita ao paciente. A correção
 * escala os ingredientes pela proporção porções-prescritas/rendimento-total
 * — nunca inventa um número, só aplica a proporção real já cadastrada.
 */
describe("scaleRecipeIngredientsToPortions", () => {
  it("1 porção de uma receita de 4 porções = 1/4 das gramas de cada ingrediente", () => {
    const ingredients = [
      { food_name: "Carne bovina moída, crua", grams: 400 },
      { food_name: "Cenoura, crua", grams: 200 },
    ];
    const scaled = scaleRecipeIngredientsToPortions(ingredients, 4, 1);
    expect(scaled[0].grams).toBe(100);
    expect(scaled[1].grams).toBe(50);
  });

  it("prescrever 2 porções de uma receita de 4 porções = metade das gramas do lote", () => {
    const ingredients = [{ food_name: "Arroz", grams: 800 }];
    const scaled = scaleRecipeIngredientsToPortions(ingredients, 4, 2);
    expect(scaled[0].grams).toBe(400);
  });

  it("receita de 1 porção (servings=1): gramas não mudam", () => {
    const ingredients = [{ food_name: "Frango", grams: 150 }];
    const scaled = scaleRecipeIngredientsToPortions(ingredients, 1, 1);
    expect(scaled[0].grams).toBe(150);
  });

  it("servings inválido (0/negativo) cai para 1 em vez de dividir por zero ou inventar", () => {
    const ingredients = [{ food_name: "Arroz", grams: 100 }];
    expect(scaleRecipeIngredientsToPortions(ingredients, 0, 1)[0].grams).toBe(100);
    expect(scaleRecipeIngredientsToPortions(ingredients, -2, 1)[0].grams).toBe(100);
  });

  it("gramas ausentes (null) permanecem null — nunca inventa um valor", () => {
    const ingredients = [{ food_name: "Sal a gosto", grams: null }];
    const scaled = scaleRecipeIngredientsToPortions(ingredients, 4, 1);
    expect(scaled[0].grams).toBeNull();
  });

  it("valor da porção escalada bate com calculateRecipeNutrition.perPortion (mesma engine, sem fórmula paralela)", () => {
    const sample = TACO_REFERENCES.find((food) => typeof food.numero === "number" && food.energia_kcal > 0)!;
    const servings = 4;
    const fullBatchIngredients = [{ taco_number: sample.numero as number, food_name: sample.descricao, grams: 400 }];
    const recipeNutrition = calculateRecipeNutrition(fullBatchIngredients, servings);

    const scaled = scaleRecipeIngredientsToPortions(fullBatchIngredients, servings, 1);
    const lookup: FoodReferenceLookup = { byTacoNumber: (n) => getTacoFoodByNumber(n), byCustomId: () => null, fuzzyMatch: () => null };
    const reference = resolveItemReference(
      { food: scaled[0].food_name, food_source: "TACO", food_ref_id: String(scaled[0].taco_number) },
      lookup
    );
    const { values } = calculateItemNutrients(String(scaled[0].grams), "g", reference);

    expect(Math.round(values.energyKcal ?? 0)).toBe(recipeNutrition.perPortion.kcal);
  });
});
