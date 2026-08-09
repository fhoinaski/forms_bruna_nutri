import { estimateFoodMacros, roundedMacros, sumMacros, type MacroTotals } from "@/lib/nutrition/macros";
import { getTacoFoodByNumber } from "@/lib/nutrition/taco";
import { type RecipeMealGroup } from "@/lib/nutrition/recipe-constants";

export interface RecipeIngredient {
  taco_number?: number | null;
  food_name: string;
  grams?: number | null;
  free_text?: string | null;
}

export interface RecipeNutrition {
  total: MacroTotals;
  perPortion: MacroTotals;
}

export function normalizeRecipeMealGroup(value: string | null | undefined): RecipeMealGroup {
  const normalized = (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (normalized.includes("cafe")) return "cafe_da_manha";
  if (normalized.includes("almoco")) return "almoco";
  if (normalized.includes("jantar")) return "jantar";
  if (normalized.includes("sobremesa")) return "sobremesa";
  if (normalized.includes("bebida") || normalized.includes("suco") || normalized.includes("vitamina")) return "bebida";
  return "lanche";
}

export function calculateRecipeNutrition(ingredients: RecipeIngredient[], servings: number): RecipeNutrition {
  const total = roundedMacros(sumMacros(ingredients.map((ingredient) => {
    if (!ingredient.taco_number || !ingredient.grams) {
      return {
        kcal: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        recognizedItems: 0,
        totalItems: 1,
      };
    }
    const food = getTacoFoodByNumber(ingredient.taco_number) ?? {
      descricao: ingredient.food_name,
      energia_kcal: 0,
      proteina_g: 0,
      carboidrato_g: 0,
      lipidios_g: 0,
    };
    return estimateFoodMacros(food.descricao, ingredient.grams, "g", [food]);
  })));
  const servingCount = Number.isFinite(servings) && servings > 0 ? servings : 1;
  return {
    total,
    perPortion: roundedMacros({
      kcal: total.kcal / servingCount,
      protein: total.protein / servingCount,
      carbs: total.carbs / servingCount,
      fat: total.fat / servingCount,
      recognizedItems: total.recognizedItems,
      totalItems: total.totalItems,
    }),
  };
}
