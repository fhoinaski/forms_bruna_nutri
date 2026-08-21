import { describe, expect, it } from "vitest";
import { calculatePlanNutrients, resolveItemReference, type FoodReferenceLookup } from "@/lib/nutrition/nutrients";
import { getTacoFoodByNumber, TACO_REFERENCES } from "@/lib/nutrition/taco";

/**
 * Causa raiz do bug "— kcal" em refeições vindas de receita: o item
 * copiado por insertRecipe (components/dashboard/MealItemsEditor.tsx)
 * setava só o campo legado `taco_number`, nunca `food_source`/
 * `food_ref_id`. resolveItemReference (lib/nutrition/nutrients.ts) SÓ
 * consulta food_source+food_ref_id para vínculo por identidade — um item
 * com apenas taco_number cai no fuzzy-match por texto (lookup.fuzzyMatch),
 * que falha silenciosamente sempre que o nome do ingrediente não bate bem
 * com a descrição TACO. Este teste prova a causa raiz E a correção.
 */
describe("resolução de item por identidade (food_source+food_ref_id) vs taco_number legado", () => {
  const sample = TACO_REFERENCES.find((food) => typeof food.numero === "number" && food.energia_kcal > 0)!;

  // Lookup deliberadamente SEM fuzzyMatch (retorna sempre null) — isola o
  // teste ao caminho de identidade, provando que SÓ food_source+food_ref_id
  // resolve, nunca dependendo de coincidência de texto.
  const lookupNoFuzzy: FoodReferenceLookup = {
    byTacoNumber: (n) => getTacoFoodByNumber(n),
    byCustomId: () => null,
    fuzzyMatch: () => null,
  };

  it("item com apenas taco_number (sem food_source/food_ref_id) NÃO resolve por identidade — reproduz o bug", () => {
    const reference = resolveItemReference(
      { food: sample.descricao, taco_number: sample.numero } as unknown as Parameters<typeof resolveItemReference>[0],
      lookupNoFuzzy
    );
    expect(reference).toBeNull();
  });

  it("item com food_source='TACO' + food_ref_id resolve corretamente por identidade — comportamento corrigido", () => {
    const reference = resolveItemReference(
      { food: sample.descricao, food_source: "TACO", food_ref_id: String(sample.numero) },
      lookupNoFuzzy
    );
    expect(reference).not.toBeNull();
    expect(reference?.descricao).toBe(sample.descricao);
  });

  it("refeição inteira formada só por itens com identidade correta calcula kcal > 0 (não fica '— kcal')", () => {
    const plan = {
      meals: [
        {
          id: "meal-1",
          name: "Receita X",
          source_recipe_id: "recipe-1",
          items: [{ id: "item-1", food: sample.descricao, quantity: "100", unit: "g", food_source: "TACO" as const, food_ref_id: String(sample.numero) }],
        },
      ],
    };
    const result = calculatePlanNutrients(plan, lookupNoFuzzy);
    expect(result.perMeal[0].values.energyKcal).not.toBeNull();
    expect(result.perMeal[0].values.energyKcal).toBeGreaterThan(0);
  });
});

describe("receita entra no total exatamente uma vez (sem double counting)", () => {
  const sample = TACO_REFERENCES.find((food) => typeof food.numero === "number" && food.energia_kcal > 0)!;
  const lookup: FoodReferenceLookup = {
    byTacoNumber: (n) => getTacoFoodByNumber(n),
    byCustomId: () => null,
    fuzzyMatch: () => null,
  };

  it("meal.source_recipe_id é só um rótulo de exibição — não soma nada extra além dos items da refeição", () => {
    const items = [{ id: "item-1", food: sample.descricao, quantity: "150", unit: "g", food_source: "TACO" as const, food_ref_id: String(sample.numero) }];

    const withRecipeLink = calculatePlanNutrients({ meals: [{ id: "m1", name: "Receita X", source_recipe_id: "recipe-1", items }] }, lookup);
    const withoutRecipeLink = calculatePlanNutrients({ meals: [{ id: "m1", name: "Refeição manual", source_recipe_id: null, items }] }, lookup);

    expect(withRecipeLink.total.values.energyKcal).toBe(withoutRecipeLink.total.values.energyKcal);
  });

  it("total diário com 2 refeições (uma delas de receita) é a soma exata das duas, sem duplicar a receita", () => {
    const recipeItems = [{ id: "r1", food: sample.descricao, quantity: "100", unit: "g", food_source: "TACO" as const, food_ref_id: String(sample.numero) }];
    const otherItems = [{ id: "o1", food: sample.descricao, quantity: "50", unit: "g", food_source: "TACO" as const, food_ref_id: String(sample.numero) }];

    const plan = {
      meals: [
        { id: "m1", name: "Receita", source_recipe_id: "recipe-1", items: recipeItems },
        { id: "m2", name: "Outra refeição", source_recipe_id: null, items: otherItems },
      ],
    };
    const result = calculatePlanNutrients(plan, lookup);
    const expectedTotal = (result.perMeal[0].values.energyKcal ?? 0) + (result.perMeal[1].values.energyKcal ?? 0);
    expect(result.total.values.energyKcal).toBeCloseTo(expectedTotal, 5);
  });
});
