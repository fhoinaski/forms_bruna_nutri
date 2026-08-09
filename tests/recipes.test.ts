import { describe, expect, it } from "vitest";
import seed from "@/lib/nutrition/data/receitas-taco-seed.json";
import { calculateRecipeNutrition } from "@/lib/nutrition/recipes";

type SeedRecipe = {
  titulo: string;
  rendimento_porcoes: number;
  ingredientes: Array<{ numero_taco: number; alimento: string; porcao_g: number }>;
  nutricao_total_receita: { energia_kcal: number; proteina_g: number; carboidrato_g: number; lipidios_g: number };
};

function expectClose(actual: number, expected: number, tolerance = 0.08) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(1, Math.abs(expected) * tolerance));
}

describe("recipe nutrition calculation", () => {
  it("recalculates breakfast recipe macros from TACO ingredients", () => {
    const recipe = (seed.receitas as SeedRecipe[]).find((item) => item.titulo === "Mingau de aveia com banana e mel");
    expect(recipe).toBeTruthy();
    const nutrition = calculateRecipeNutrition(recipe!.ingredientes.map((ingredient) => ({
      taco_number: ingredient.numero_taco,
      food_name: ingredient.alimento,
      grams: ingredient.porcao_g,
    })), recipe!.rendimento_porcoes);

    expectClose(nutrition.total.kcal, recipe!.nutricao_total_receita.energia_kcal);
    expectClose(nutrition.total.protein, recipe!.nutricao_total_receita.proteina_g);
    expectClose(nutrition.total.carbs, recipe!.nutricao_total_receita.carboidrato_g);
    expectClose(nutrition.total.fat, recipe!.nutricao_total_receita.lipidios_g);
  });

  it("recalculates lunch recipe macros from TACO ingredients", () => {
    const recipe = (seed.receitas as SeedRecipe[]).find((item) => item.titulo.includes("tilápia assado"));
    expect(recipe).toBeTruthy();
    const nutrition = calculateRecipeNutrition(recipe!.ingredientes.map((ingredient) => ({
      taco_number: ingredient.numero_taco,
      food_name: ingredient.alimento,
      grams: ingredient.porcao_g,
    })), recipe!.rendimento_porcoes);

    expectClose(nutrition.total.kcal, recipe!.nutricao_total_receita.energia_kcal);
    expectClose(nutrition.total.protein, recipe!.nutricao_total_receita.proteina_g);
    expectClose(nutrition.total.carbs, recipe!.nutricao_total_receita.carboidrato_g);
    expectClose(nutrition.total.fat, recipe!.nutricao_total_receita.lipidios_g);
  });
});
