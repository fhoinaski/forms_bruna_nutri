import type { MacroReferenceFood } from "@/lib/nutrition/macros";

/**
 * Snapshot de composicao de um alimento (FASE 20 do pedido) — congelado no
 * momento da prescricao, para que um plano antigo NAO mude retroativamente se
 * a base (taco.json / custom_foods) for atualizada num deploy futuro.
 *
 * Este modulo e PURO (sem I/O) para poder ser importado por componentes
 * client-side (ex.: MealPlanNutritionSummary via nutrients.ts). A resolucao
 * do vinculo (TACO em memoria / custom no D1) fica em food-snapshot-server.ts,
 * que NAO deve ser importado pelo client.
 */

export const NUTRITION_SNAPSHOT_FIELDS = [
  "energia_kcal",
  "proteina_g",
  "carboidrato_g",
  "lipidios_g",
  "fibra_g",
  "sodio_mg",
  "calcio_mg",
  "ferro_mg",
  "potassio_mg",
  "vitamina_c_mg",
  "energy_kj",
  "sugars_g",
  "saturated_fat_g",
  "monounsaturated_fat_g",
  "polyunsaturated_fat_g",
  "trans_fat_g",
  "magnesium_mg",
  "phosphorus_mg",
  "zinc_mg",
  "copper_mg",
  "manganese_mg",
  "selenium_mcg",
  "vitamin_a_mcg",
  "vitamin_d_mcg",
  "vitamin_e_mg",
  "vitamin_k_mcg",
  "vitamin_b1_mg",
  "vitamin_b2_mg",
  "vitamin_b3_mg",
  "pantothenic_acid_mg",
  "vitamin_b6_mg",
  "folate_mcg",
  "vitamin_b12_mcg",
  "cholesterol_mg",
] as const;

export interface FoodItemSnapshot {
  food_name_snapshot: string | null;
  nutrition_snapshot: string | null;
}

function numberOr(value: unknown, fallback: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Serializa a composicao por 100g de uma referencia resolvida (write path). */
export function buildNutritionSnapshot(reference: MacroReferenceFood): string {
  const snapshot: Record<string, unknown> = {};
  for (const field of NUTRITION_SNAPSHOT_FIELDS) {
    const value = reference[field];
    snapshot[field] = value === undefined ? null : value;
  }
  return JSON.stringify(snapshot);
}

/**
 * R6 (seções 47-54) — snapshot de um ITEM DE RECEITA, não de um alimento
 * por-100g: uma receita não tem densidade fixa (o rateio depende de
 * rendimento/porções, não de gramas puras), então em vez de congelar uma
 * "referência por 100g" (que exigiria sempre um equivalente em gramas,
 * inviável no modo PORTION_COUNT), congela os VALORES JÁ CALCULADOS pra
 * aquela quantidade exata no momento do save — reaproveitando a MESMA
 * coluna `nutrition_snapshot`, sem schema novo. Discriminado por `kind`
 * pra nunca ser confundido com o shape antigo (por-100g) por
 * `referenceFromSnapshot`.
 */
export interface RecipeItemSnapshotPayload {
  kind: "recipe_item_v1";
  values: Record<string, number | null>;
}

export function buildRecipeItemSnapshot(values: Record<string, number | null>): string {
  return JSON.stringify({ kind: "recipe_item_v1", values } satisfies RecipeItemSnapshotPayload);
}

/** `null` quando o snapshot não existe, está corrompido, ou não é do shape de item de receita (ex.: snapshot por-100g legado). */
export function recipeItemValuesFromSnapshot(snapshot: string | null | undefined): Record<string, number | null> | null {
  if (!snapshot) return null;
  try {
    const parsed = JSON.parse(snapshot) as Partial<RecipeItemSnapshotPayload>;
    if (parsed?.kind !== "recipe_item_v1" || !parsed.values || typeof parsed.values !== "object") return null;
    return parsed.values;
  } catch {
    return null;
  }
}

/** Reconstroi um MacroReferenceFood a partir do snapshot historico (read path). */
export function referenceFromSnapshot(
  food: string,
  foodNameSnapshot: string | null | undefined,
  nutritionSnapshot: string | null | undefined
): MacroReferenceFood | null {
  if (!nutritionSnapshot) return null;
  try {
    const parsed = JSON.parse(nutritionSnapshot) as Record<string, unknown>;
    return {
      descricao: foodNameSnapshot ?? food,
      energia_kcal: numberOr(parsed.energia_kcal, 0) ?? 0,
      proteina_g: numberOr(parsed.proteina_g, 0) ?? 0,
      carboidrato_g: numberOr(parsed.carboidrato_g, 0) ?? 0,
      lipidios_g: numberOr(parsed.lipidios_g, 0) ?? 0,
      fibra_g: numberOr(parsed.fibra_g, null),
      sodio_mg: numberOr(parsed.sodio_mg, null),
      calcio_mg: numberOr(parsed.calcio_mg, null),
      ferro_mg: numberOr(parsed.ferro_mg, null),
      potassio_mg: numberOr(parsed.potassio_mg, null),
      vitamina_c_mg: numberOr(parsed.vitamina_c_mg, null),
      energy_kj: numberOr(parsed.energy_kj, null),
      sugars_g: numberOr(parsed.sugars_g, null),
      saturated_fat_g: numberOr(parsed.saturated_fat_g, null),
      monounsaturated_fat_g: numberOr(parsed.monounsaturated_fat_g, null),
      polyunsaturated_fat_g: numberOr(parsed.polyunsaturated_fat_g, null),
      trans_fat_g: numberOr(parsed.trans_fat_g, null),
      magnesium_mg: numberOr(parsed.magnesium_mg, null),
      phosphorus_mg: numberOr(parsed.phosphorus_mg, null),
      zinc_mg: numberOr(parsed.zinc_mg, null),
      copper_mg: numberOr(parsed.copper_mg, null),
      manganese_mg: numberOr(parsed.manganese_mg, null),
      selenium_mcg: numberOr(parsed.selenium_mcg, null),
      vitamin_a_mcg: numberOr(parsed.vitamin_a_mcg, null),
      vitamin_d_mcg: numberOr(parsed.vitamin_d_mcg, null),
      vitamin_e_mg: numberOr(parsed.vitamin_e_mg, null),
      vitamin_k_mcg: numberOr(parsed.vitamin_k_mcg, null),
      vitamin_b1_mg: numberOr(parsed.vitamin_b1_mg, null),
      vitamin_b2_mg: numberOr(parsed.vitamin_b2_mg, null),
      vitamin_b3_mg: numberOr(parsed.vitamin_b3_mg, null),
      pantothenic_acid_mg: numberOr(parsed.pantothenic_acid_mg, null),
      vitamin_b6_mg: numberOr(parsed.vitamin_b6_mg, null),
      folate_mcg: numberOr(parsed.folate_mcg, null),
      vitamin_b12_mcg: numberOr(parsed.vitamin_b12_mcg, null),
      cholesterol_mg: numberOr(parsed.cholesterol_mg, null),
    };
  } catch {
    return null;
  }
}
