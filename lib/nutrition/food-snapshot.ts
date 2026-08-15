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
    };
  } catch {
    return null;
  }
}