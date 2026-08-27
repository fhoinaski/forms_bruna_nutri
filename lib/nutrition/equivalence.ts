import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import { roundToPracticalQuantity } from "@/lib/nutrition/equivalent-quantity";

/**
 * Motor de equivalencias (secoes 22-24 do pedido) — 100% deterministico,
 * nunca chama IA. Dado um alimento base numa quantidade e um nutriente-alvo,
 * resolve algebricamente a gramatura de cada candidato que produziria o
 * MESMO valor do nutriente, arredonda para um incremento pratico de 5g (uma
 * nutricionista prescreve "30g", nao "27.43g") e so mantem o candidato se o
 * valor resultante APOS o arredondamento ainda cair dentro da tolerancia —
 * e ai que a tolerancia realmente entra em jogo. Candidatos da mesma
 * categoria (`grupo` do TACO) sao sempre priorizados no ranking, mesmo sem
 * `sameCategoryOnly` — e o que impede sugerir banana -> acucar so porque o
 * carboidrato bate (secao 24).
 */

export type EquivalenceNutrient = "energyKcal" | "proteinG" | "carbohydrateG" | "fatG";

const NUTRIENT_FIELD: Record<EquivalenceNutrient, keyof MacroReferenceFood> = {
  energyKcal: "energia_kcal",
  proteinG: "proteina_g",
  carbohydrateG: "carboidrato_g",
  fatG: "lipidios_g",
};

const MIN_PLAUSIBLE_GRAMS = 5;
const MAX_PLAUSIBLE_GRAMS = 1000;
const DEFAULT_TOLERANCE_PERCENT = 10;
const DEFAULT_LIMIT = 5;

export interface FindEquivalentFoodsOptions {
  baseFood: MacroReferenceFood;
  amountGrams: number;
  targetNutrient: EquivalenceNutrient;
  candidates: MacroReferenceFood[];
  tolerancePercent?: number;
  sameCategoryOnly?: boolean;
  limit?: number;
}

export interface EquivalentFoodResult {
  food: MacroReferenceFood;
  gramsNeeded: number;
  nutrientAtThatAmount: number;
  deltaPercent: number;
  sameCategory: boolean;
}

function isSameFood(a: MacroReferenceFood, b: MacroReferenceFood): boolean {
  return a.numero !== undefined && a.numero === b.numero && a.fonte === b.fonte;
}

export function findEquivalentFoods(options: FindEquivalentFoodsOptions): EquivalentFoodResult[] {
  const {
    baseFood,
    amountGrams,
    targetNutrient,
    candidates,
    tolerancePercent = DEFAULT_TOLERANCE_PERCENT,
    sameCategoryOnly = false,
    limit = DEFAULT_LIMIT,
  } = options;

  const field = NUTRIENT_FIELD[targetNutrient];
  const basePer100 = baseFood[field] as number;
  if (!Number.isFinite(basePer100) || basePer100 <= 0 || amountGrams <= 0) return [];
  const baseAmountValue = (basePer100 * amountGrams) / 100;

  const pool = sameCategoryOnly && baseFood.grupo ? candidates.filter((candidate) => candidate.grupo === baseFood.grupo) : candidates;

  const results: EquivalentFoodResult[] = [];
  for (const candidate of pool) {
    if (isSameFood(candidate, baseFood)) continue;
    const candidatePer100 = candidate[field] as number;
    if (!Number.isFinite(candidatePer100) || candidatePer100 <= 0) continue;

    const rawGramsNeeded = (baseAmountValue / candidatePer100) * 100;
    if (rawGramsNeeded < MIN_PLAUSIBLE_GRAMS || rawGramsNeeded > MAX_PLAUSIBLE_GRAMS) continue;

    const roundedGrams = roundToPracticalQuantity(rawGramsNeeded);
    const nutrientAtThatAmount = (candidatePer100 * roundedGrams) / 100;
    const deltaPercent = ((nutrientAtThatAmount - baseAmountValue) / baseAmountValue) * 100;
    if (Math.abs(deltaPercent) > tolerancePercent) continue;

    results.push({
      food: candidate,
      gramsNeeded: roundedGrams,
      nutrientAtThatAmount: Math.round(nutrientAtThatAmount * 10) / 10,
      deltaPercent: Math.round(deltaPercent * 10) / 10,
      sameCategory: Boolean(baseFood.grupo) && candidate.grupo === baseFood.grupo,
    });
  }

  results.sort((a, b) => {
    if (a.sameCategory !== b.sameCategory) return a.sameCategory ? -1 : 1;
    return Math.abs(a.deltaPercent) - Math.abs(b.deltaPercent);
  });

  return results.slice(0, Math.max(1, limit));
}
