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

/**
 * Escala as gramas dos ingredientes de uma receita para a quantidade de
 * PORÇÕES realmente prescritas ao paciente — `servings` sempre é o
 * rendimento total da receita (nunca null/inválido: o repositório de
 * receitas normaliza para no mínimo 1 antes de salvar). Sem isso, inserir
 * uma receita de 4 porções numa refeição copiava as gramas do LOTE inteiro
 * (ex.: 800g de arroz para o lote todo), fazendo o motor calcular e exibir
 * o total da receita inteira (ex.: 1510 kcal) como se fosse a refeição de
 * uma pessoa — a causa raiz do bug de "receita mostra total em vez da
 * porção prescrita" na impressão (a impressão em si nunca calculou nada:
 * o problema era o dado gravado no plano, não a apresentação).
 */
export function scaleRecipeIngredientsToPortions<T extends { grams?: number | null }>(
  ingredients: T[],
  servings: number,
  prescribedPortions: number
): T[] {
  const servingCount = Number.isFinite(servings) && servings > 0 ? servings : 1;
  const portions = Number.isFinite(prescribedPortions) && prescribedPortions > 0 ? prescribedPortions : 1;
  const factor = portions / servingCount;
  return ingredients.map((ingredient) => ({
    ...ingredient,
    grams: ingredient.grams === null || ingredient.grams === undefined ? ingredient.grams : Math.round(ingredient.grams * factor * 10) / 10,
  }));
}

export function calculateRecipeNutrition(ingredients: RecipeIngredient[], servings: number): RecipeNutrition {
  // Soma bruta primeiro (precisao total); total e perPortion sao arredondados
  // UMA VEZ CADA a partir dessa mesma soma bruta — nunca divide um total ja
  // arredondado pelas porcoes e arredonda de novo (item 23 do pedido: isso
  // gravava um erro de arredondamento composto direto na tabela recipes).
  const rawTotal = sumMacros(ingredients.map((ingredient) => {
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
  }));
  const servingCount = Number.isFinite(servings) && servings > 0 ? servings : 1;
  return {
    total: roundedMacros(rawTotal),
    perPortion: roundedMacros({
      kcal: rawTotal.kcal / servingCount,
      protein: rawTotal.protein / servingCount,
      carbs: rawTotal.carbs / servingCount,
      fat: rawTotal.fat / servingCount,
      recognizedItems: rawTotal.recognizedItems,
      totalItems: rawTotal.totalItems,
    }),
  };
}
