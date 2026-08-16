import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import { getTacoFoodByNumber } from "@/lib/nutrition/taco";
import { getCustomFoodById, toMacroReferenceFood } from "@/lib/repositories/custom-foods";
import { buildNutritionSnapshot, type FoodItemSnapshot } from "@/lib/nutrition/food-snapshot";
import { getUsdaFoodBySourceId, toUsdaMacroReference } from "@/lib/repositories/usda-foods";

/**
 * Resolucao do vinculo de um alimento (write path do snapshot) — SERVER-ONLY.
 * Nao importar de componentes client-side: puxa custom-foods -> d1/client ->
 * observability/trace (node:async_hooks). A parte pura fica em food-snapshot.ts.
 */

/** Resolve a referencia de um alimento por vinculo estruturado (TACO/custom). */
export async function resolveFoodReference(
  foodSource: string | null | undefined,
  foodRefId: string | null | undefined
): Promise<MacroReferenceFood | null> {
  if (!foodRefId) return null;
  if (foodSource === "TACO") return getTacoFoodByNumber(foodRefId);
  if (foodSource === "CUSTOM" || foodSource === "MANUFACTURER") {
    const row = await getCustomFoodById(foodRefId);
    return row ? toMacroReferenceFood(row) : null;
  }
  if (foodSource === "USDA") {
    const row = await getUsdaFoodBySourceId(foodRefId);
    return row ? toUsdaMacroReference(row) : null;
  }
  return null;
}

/** Congela nome + composicao de um item vinculado (null quando nao ha vinculo). */
export async function buildItemSnapshot(
  foodSource: string | null | undefined,
  foodRefId: string | null | undefined
): Promise<FoodItemSnapshot> {
  const reference = await resolveFoodReference(foodSource, foodRefId);
  if (!reference) return { food_name_snapshot: null, nutrition_snapshot: null };
  return {
    food_name_snapshot: reference.descricao,
    nutrition_snapshot: buildNutritionSnapshot(reference),
  };
}
