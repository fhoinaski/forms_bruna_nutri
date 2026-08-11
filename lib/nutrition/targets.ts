import type { NutrientKey, NutrientValues } from "@/lib/nutrition/nutrients";

/**
 * Comparacao meta x prescrito (secoes 11-16 do pedido). A meta e sempre
 * digitada pela nutricionista (lib/repositories/meal-plans.ts,
 * `target_*`) — nunca calculada aqui. So compara os nutrientes que
 * realmente tem meta definida; sem meta, o nutriente simplesmente nao
 * entra na tabela (secao 16: "Nao usar IA", puramente determinístico).
 */
export interface NutrientTarget {
  energyKcal?: number | null;
  proteinG?: number | null;
  carbohydrateG?: number | null;
  fatG?: number | null;
}

export interface TargetComparisonRow {
  nutrient: NutrientKey;
  target: number;
  prescribed: number | null;
  diff: number | null;
  percentOfTarget: number | null;
}

const TARGET_KEYS: (keyof NutrientTarget)[] = ["energyKcal", "proteinG", "carbohydrateG", "fatG"];

export function compareTargetVsPrescribed(target: NutrientTarget, prescribed: NutrientValues): TargetComparisonRow[] {
  const rows: TargetComparisonRow[] = [];
  for (const key of TARGET_KEYS) {
    const targetValue = target[key];
    if (targetValue === null || targetValue === undefined) continue;
    const prescribedValue = prescribed[key];
    rows.push({
      nutrient: key,
      target: targetValue,
      prescribed: prescribedValue,
      diff: prescribedValue === null ? null : prescribedValue - targetValue,
      percentOfTarget: prescribedValue === null || targetValue === 0 ? null : Math.round((prescribedValue / targetValue) * 1000) / 10,
    });
  }
  return rows;
}
