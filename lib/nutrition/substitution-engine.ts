import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import { findEquivalentFoods, type EquivalentFoodResult } from "@/lib/nutrition/equivalence";
import { calculateItemNutrients } from "@/lib/nutrition/nutrients";

/**
 * Substitution Engine — encontra alimentos nutricionalmente equivalentes a
 * um alimento prescrito, numa quantidade prática, com um score/qualidade
 * determinísticos. 100% síncrono e sem I/O (mesma filosofia de
 * equivalence.ts, que este módulo REAPROVEITA para o modo "energy" — nunca
 * duplica a lógica de arredondamento/busca algébrica que já existe e já é
 * testada).
 *
 * Responsabilidades (nunca violadas por design):
 * - A IA NUNCA entra aqui calculando nada — este módulo só recebe
 *   MacroReferenceFood já resolvidos (pelo catálogo real) e devolve números
 *   calculados deterministicamente.
 * - `null` nunca vira 0: um nutriente sem dado em QUALQUER lado da
 *   comparação é excluído do score, nunca tratado como "zero" (o que
 *   inflaria artificialmente o erro relativo ou esconderia uma incerteza
 *   real).
 * - Depois de arredondar a quantidade pra um incremento prático, o valor
 *   final SEMPRE é recalculado via `calculateItemNutrients` (a mesma engine
 *   usada por todo o resto do app) — nunca a fórmula algébrica inicial usada
 *   só para resolver a incógnita da gramatura.
 */

export type EquivalenceMode = "energy" | "nutritional";
export type SubstitutionQuality = "EXCELLENT" | "GOOD" | "REVIEW" | "UNSUITABLE";
export type FoodRole = "carbohydrate" | "protein" | "fat" | "mixed";

export interface SubstitutionWeights {
  energy: number;
  protein: number;
  carbohydrate: number;
  fat: number;
  fiber: number;
}

export interface SubstitutionTolerances {
  energyPct: number;
  proteinPct: number;
  carbohydratePct: number;
  fatPct: number;
  fiberPct: number;
}

/**
 * Pesos POR PAPEL NUTRICIONAL do alimento-base (seção 4B do pedido) —
 * centralizados, documentados, nunca espalhados como número mágico.
 * Classificação técnica (% de kcal vindo de cada macro), nunca uma
 * categoria clínica inventada — ver `classifyFoodRole`.
 */
export const DEFAULT_SUBSTITUTION_WEIGHTS_BY_ROLE: Record<FoodRole, SubstitutionWeights> = {
  carbohydrate: { energy: 1, protein: 0.3, carbohydrate: 1, fat: 0.3, fiber: 0.4 },
  protein: { energy: 0.8, protein: 1.2, carbohydrate: 0.3, fat: 0.6, fiber: 0.1 },
  fat: { energy: 1, protein: 0.3, carbohydrate: 0.3, fat: 1.2, fiber: 0.1 },
  mixed: { energy: 1, protein: 0.7, carbohydrate: 0.7, fat: 0.7, fiber: 0.3 },
};

/**
 * Tolerâncias TÉCNICAS de convergência (seção 6) — nunca uma recomendação
 * clínica. Energia mais apertada (±5%) que macros secundários (±10%);
 * fibra mais larga (±20%) por ser sempre secundária no score.
 */
export const DEFAULT_SUBSTITUTION_TOLERANCES: SubstitutionTolerances = {
  energyPct: 5,
  proteinPct: 10,
  carbohydratePct: 10,
  fatPct: 10,
  fiberPct: 20,
};

const MIN_PLAUSIBLE_GRAMS = 5;
const MAX_PLAUSIBLE_GRAMS = 1000;
const PRACTICAL_INCREMENT_GRAMS = 5;
const DEFAULT_LIMIT = 5;

/**
 * Classificação técnica explícita e conservadora do papel nutricional
 * predominante — nunca uma categoria clínica (seção 4 do pedido: "não
 * inventar classificação clínica"). Baseada só em % de kcal por macro.
 */
export function classifyFoodRole(food: MacroReferenceFood): FoodRole {
  const proteinKcal = Math.max(0, food.proteina_g ?? 0) * 4;
  const carbKcal = Math.max(0, food.carboidrato_g ?? 0) * 4;
  const fatKcal = Math.max(0, food.lipidios_g ?? 0) * 9;
  const total = proteinKcal + carbKcal + fatKcal;
  if (total <= 0) return "mixed";
  const proteinShare = proteinKcal / total;
  const carbShare = carbKcal / total;
  const fatShare = fatKcal / total;
  if (proteinShare >= 0.35) return "protein";
  if (fatShare >= 0.45) return "fat";
  if (carbShare >= 0.5) return "carbohydrate";
  return "mixed";
}

export interface NutrientSnapshot {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

const NUTRIENT_KEYS: (keyof SubstitutionWeights)[] = ["energy", "protein", "carbohydrate", "fat", "fiber"];
const SNAPSHOT_FIELD: Record<keyof SubstitutionWeights, keyof NutrientSnapshot> = {
  energy: "energyKcal",
  protein: "proteinG",
  carbohydrate: "carbohydrateG",
  fat: "fatG",
  fiber: "fiberG",
};

/** `null` num dos dois lados → erro desconhecido (nunca 0). `0` na base com `0` no candidato → equivalência perfeita nesse eixo. `0` na base com valor no candidato → desconhecido (divisão por zero evitada, nunca aproximado). */
function relativeError(base: number | null | undefined, candidate: number | null | undefined): number | null {
  if (base === null || base === undefined || candidate === null || candidate === undefined) return null;
  if (base === 0) return candidate === 0 ? 0 : null;
  return Math.abs(candidate - base) / Math.abs(base);
}

export interface EquivalenceScoreResult {
  /** Menor é melhor. Infinity quando nenhum nutriente pôde ser comparado (nunca finge equivalência). */
  score: number;
  quality: SubstitutionQuality;
  consideredNutrients: (keyof SubstitutionWeights)[];
  errorsByNutrient: Partial<Record<keyof SubstitutionWeights, number>>;
}

/**
 * Score determinístico (seção 5): soma ponderada dos erros relativos dos
 * nutrientes REALMENTE disponíveis nos dois lados — nunca inclui um
 * nutriente desconhecido como erro 0. Normalizado pela soma dos pesos
 * efetivamente usados, então o score continua comparável mesmo quando um
 * candidato tem menos dados disponíveis que outro.
 */
export function computeEquivalenceScore(
  base: NutrientSnapshot,
  candidate: NutrientSnapshot,
  weights: SubstitutionWeights,
  tolerances: SubstitutionTolerances
): EquivalenceScoreResult {
  let weightedSum = 0;
  let weightTotal = 0;
  const errorsByNutrient: Partial<Record<keyof SubstitutionWeights, number>> = {};
  const consideredNutrients: (keyof SubstitutionWeights)[] = [];

  for (const key of NUTRIENT_KEYS) {
    const err = relativeError(base[SNAPSHOT_FIELD[key]], candidate[SNAPSHOT_FIELD[key]]);
    if (err === null) continue;
    consideredNutrients.push(key);
    errorsByNutrient[key] = err;
    weightedSum += weights[key] * err;
    weightTotal += weights[key];
  }

  const score = weightTotal > 0 ? weightedSum / weightTotal : Number.POSITIVE_INFINITY;

  const toleranceOf: Record<keyof SubstitutionWeights, number> = {
    energy: tolerances.energyPct / 100,
    protein: tolerances.proteinPct / 100,
    carbohydrate: tolerances.carbohydratePct / 100,
    fat: tolerances.fatPct / 100,
    fiber: tolerances.fiberPct / 100,
  };
  const withinAllConsidered = consideredNutrients.length > 0
    && consideredNutrients.every((key) => (errorsByNutrient[key] ?? Number.POSITIVE_INFINITY) <= toleranceOf[key]);
  const energyErr = errorsByNutrient.energy;

  let quality: SubstitutionQuality;
  if (consideredNutrients.length === 0) {
    quality = "UNSUITABLE";
  } else if (withinAllConsidered && score <= 0.05) {
    quality = "EXCELLENT";
  } else if (withinAllConsidered) {
    quality = "GOOD";
  } else if (energyErr !== undefined && energyErr <= toleranceOf.energy * 2) {
    // Energia ainda razoavelmente próxima, mas algum macro fora da
    // tolerância — não é ruim o bastante pra descartar, mas exige olhar
    // humano antes de aprovar (nunca aprovado silenciosamente, seção 6).
    quality = "REVIEW";
  } else {
    quality = "UNSUITABLE";
  }

  return { score, quality, consideredNutrients, errorsByNutrient };
}

function toSnapshot(values: { energyKcal: number | null; proteinG: number | null; carbohydrateG: number | null; fatG: number | null; fiberG?: number | null }): NutrientSnapshot {
  return { energyKcal: values.energyKcal, proteinG: values.proteinG, carbohydrateG: values.carbohydrateG, fatG: values.fatG, fiberG: values.fiberG ?? null };
}

function macroReferenceAtGrams(food: MacroReferenceFood, grams: number): NutrientSnapshot {
  // Reaproveita a MESMA engine usada em todo o app pra calcular os valores
  // finais na quantidade JÁ arredondada — nunca confia na fórmula algébrica
  // usada só para resolver a incógnita da gramatura (seção 7 do pedido).
  const { values } = calculateItemNutrients(String(grams), "g", food);
  return toSnapshot(values);
}

function isSameFood(a: MacroReferenceFood, b: MacroReferenceFood): boolean {
  return a.numero !== undefined && a.numero === b.numero && a.fonte === b.fonte;
}

function roundToPracticalGrams(grams: number): number {
  return Math.max(PRACTICAL_INCREMENT_GRAMS, Math.round(grams / PRACTICAL_INCREMENT_GRAMS) * PRACTICAL_INCREMENT_GRAMS);
}

export interface FoodSubstituteResult {
  food: MacroReferenceFood;
  /** Quantidade final PRÁTICA (múltiplo de 5g) — já revalidada pela engine. */
  quantityGrams: number;
  /** Valores nutricionais na quantidade final, vindos da engine (nunca da fórmula algébrica). */
  nutrition: NutrientSnapshot;
  mode: EquivalenceMode;
  score: number;
  quality: SubstitutionQuality;
  sameCategory: boolean;
}

export interface FindFoodSubstitutesOptions {
  baseFood: MacroReferenceFood;
  baseGrams: number;
  candidates: MacroReferenceFood[];
  mode: EquivalenceMode;
  weights?: Partial<SubstitutionWeights>;
  tolerances?: Partial<SubstitutionTolerances>;
  sameCategoryOnly?: boolean;
  limit?: number;
}

/**
 * Ponto de entrada único do Substitution Engine. Modo "energy": delega
 * inteiramente pro motor algébrico já existente (`findEquivalentFoods`),
 * só adicionando quality/score no formato deste módulo. Modo "nutritional"
 * (preferencial, seção 4B): resolve a gramatura pelo nutriente PRIMÁRIO do
 * papel nutricional do alimento-base, arredonda, revalida pela engine, e só
 * então computa o score multi-nutriente completo — a mesma ordem exigida
 * pelo pedido (algebra → arredondar → recalcular → score).
 */
export function findFoodSubstitutes(options: FindFoodSubstitutesOptions): FoodSubstituteResult[] {
  const { baseFood, baseGrams, candidates, mode, sameCategoryOnly = false, limit = DEFAULT_LIMIT } = options;
  if (baseGrams <= 0) return [];

  const role = classifyFoodRole(baseFood);
  const weights: SubstitutionWeights = { ...DEFAULT_SUBSTITUTION_WEIGHTS_BY_ROLE[role], ...options.weights };
  const tolerances: SubstitutionTolerances = { ...DEFAULT_SUBSTITUTION_TOLERANCES, ...options.tolerances };
  const baseSnapshot = macroReferenceAtGrams(baseFood, baseGrams);

  if (mode === "energy") {
    const equivalents: EquivalentFoodResult[] = findEquivalentFoods({
      baseFood,
      amountGrams: baseGrams,
      targetNutrient: "energyKcal",
      candidates,
      tolerancePercent: tolerances.energyPct,
      sameCategoryOnly,
      limit,
    });
    return equivalents
      .map((equivalent) => {
        // Revalida pela engine (nunca confia no `nutrientAtThatAmount` do
        // motor algébrico, que só calcula o eixo-alvo, não os outros macros).
        const nutrition = macroReferenceAtGrams(equivalent.food, equivalent.gramsNeeded);
        const scoreResult = computeEquivalenceScore(baseSnapshot, nutrition, weights, tolerances);
        return {
          food: equivalent.food,
          quantityGrams: equivalent.gramsNeeded,
          nutrition,
          mode,
          score: scoreResult.score,
          quality: scoreResult.quality,
          sameCategory: equivalent.sameCategory,
        };
      })
      // UNSUITABLE nunca aparece como opção normal (seção 22) — mesmo
      // critério já aplicado no modo nutricional, faltava aqui.
      .filter((result) => result.quality !== "UNSUITABLE");
  }

  // Modo nutricional: resolve a gramatura pelo nutriente primário do papel
  // do alimento-base (ex.: carboidrato para um alimento predominantemente
  // energético/carboidrato) — mesma álgebra conceitual da seção 4A,
  // generalizada pro nutriente que mais importa pra ESTE alimento.
  const primaryField: keyof MacroReferenceFood = role === "protein" ? "proteina_g" : role === "fat" ? "lipidios_g" : role === "carbohydrate" ? "carboidrato_g" : "energia_kcal";
  const basePrimaryPer100 = baseFood[primaryField] as number | undefined;
  if (!Number.isFinite(basePrimaryPer100) || (basePrimaryPer100 as number) <= 0) return [];
  const basePrimaryAmount = ((basePrimaryPer100 as number) * baseGrams) / 100;

  const pool = sameCategoryOnly && baseFood.grupo ? candidates.filter((c) => c.grupo === baseFood.grupo) : candidates;
  const results: FoodSubstituteResult[] = [];

  for (const candidate of pool) {
    if (isSameFood(candidate, baseFood)) continue;
    const candidatePrimaryPer100 = candidate[primaryField] as number | undefined;
    if (!Number.isFinite(candidatePrimaryPer100) || (candidatePrimaryPer100 as number) <= 0) continue;

    const rawGrams = (basePrimaryAmount / (candidatePrimaryPer100 as number)) * 100;
    if (rawGrams < MIN_PLAUSIBLE_GRAMS || rawGrams > MAX_PLAUSIBLE_GRAMS) continue;
    const roundedGrams = roundToPracticalGrams(rawGrams);

    // Revalidação obrigatória pela engine oficial (seção 7) — os valores
    // finais usados no score/exibição/persistência SEMPRE vêm daqui, nunca
    // da álgebra usada só pra achar a gramatura.
    const nutrition = macroReferenceAtGrams(candidate, roundedGrams);
    const scoreResult = computeEquivalenceScore(baseSnapshot, nutrition, weights, tolerances);
    if (scoreResult.quality === "UNSUITABLE") continue; // fora de qualquer tolerância relevante — não vale nem mostrar como candidato

    results.push({
      food: candidate,
      quantityGrams: roundedGrams,
      nutrition,
      mode,
      score: scoreResult.score,
      quality: scoreResult.quality,
      sameCategory: Boolean(baseFood.grupo) && candidate.grupo === baseFood.grupo,
    });
  }

  results.sort((a, b) => {
    if (a.sameCategory !== b.sameCategory) return a.sameCategory ? -1 : 1;
    return a.score - b.score;
  });

  return results.slice(0, Math.max(1, limit));
}
