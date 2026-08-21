import type { DraftMeal, DraftMealItem, MealKey } from "@/lib/nutrition/draft-types";
import { calculateDraftNutritionRaw } from "@/lib/nutrition/draft-nutrition";
import { resolveItemReference, type FoodReferenceLookup } from "@/lib/nutrition/nutrients";
import { resolveMealPlanChangeReferences, buildFoodReferenceLookup } from "@/lib/ai/agents/nutrition/meal-plan-change-agent";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";

/**
 * OPTIMIZER V2 — busca local determinística multi-objetivo (seções 1-21 do
 * pedido). Continua o mesmo princípio do V1: nunca troca/adiciona/remove
 * alimento, nunca usa IA, nunca inventa meta ausente, resultado final
 * SEMPRE validado pela engine real (calculateDraftNutritionRaw) antes de
 * responder — o "score" e as somas incrementais usadas DURANTE a busca são
 * só uma representação matemática auxiliar (seção 38), nunca a fonte de
 * verdade.
 *
 * V1 (draft-optimizer.ts) continua existindo e exportado — é uma estratégia
 * mais simples (escala tudo proporcionalmente) que ainda é útil como
 * fallback ou para quem só tem meta de energia. V2 é aditivo, não substitui.
 */

export type OptimizerTargetKey = "energy" | "protein" | "carbohydrate" | "fat" | "fiber";
const ALL_TARGET_KEYS: OptimizerTargetKey[] = ["energy", "protein", "carbohydrate", "fat", "fiber"];

/** Meta de otimização — estende NutrientTarget com fibra OPCIONAL (só entra se explicitamente informada, seção 34). Tipo próprio do optimizer, não do NutrientTarget compartilhado (que não tem campo de fibra e é usado pela tabela de comparação meta×prescrito em vários outros lugares — não alterar isso aqui). */
export interface OptimizerTarget {
  energyKcal?: number | null;
  proteinG?: number | null;
  carbohydrateG?: number | null;
  fatG?: number | null;
  fiberG?: number | null;
}

/** Pesos do score — centralizados, documentados, configuráveis (seção 5). Nunca espalhados como magic numbers pelo código. */
export interface OptimizerWeights {
  energy: number;
  protein: number;
  carbohydrate: number;
  fat: number;
  fiber: number;
}
export const DEFAULT_OPTIMIZER_WEIGHTS: OptimizerWeights = {
  energy: 1,
  protein: 1,
  carbohydrate: 1,
  fat: 1,
  // Fibra pesa menos por padrão — só entra quando há meta explícita (seção
  // 34), e mesmo assim é secundária às 4 metas macro clássicas.
  fiber: 0.5,
};

/** Tolerâncias — critério TÉCNICO de convergência/parada, nunca uma recomendação clínica (seção 6). */
export interface OptimizerTolerances {
  energyPct: number;
  proteinPct: number;
  carbohydratePct: number;
  fatPct: number;
  fiberPct: number;
}
export const DEFAULT_OPTIMIZER_TOLERANCES: OptimizerTolerances = {
  energyPct: 5,
  proteinPct: 8,
  carbohydratePct: 8,
  fatPct: 8,
  fiberPct: 10,
};

/** Distribuição energética OPCIONAL por refeição (seção 7) — nunca obrigatória, nunca inventada. */
export interface MealDistributionEntry {
  mealKey: MealKey;
  /** 0-100. */
  percentage: number;
}

export interface OptimizeDraftV2Options {
  /** Iterações de BUSCA (candidate moves), não "passes de escala" como no V1 — cada iteração testa candidatos e aplica no máximo 1 movimento. */
  maxIterations?: number;
  tolerances?: Partial<OptimizerTolerances>;
  weights?: Partial<OptimizerWeights>;
  /** Se omitido, é derivado automaticamente de quais campos da meta foram informados — nunca otimiza um eixo sem meta real (seção 5). Pode ser usado pra restringir ainda mais (seção 25: "ajustar só proteína"). */
  activeTargets?: OptimizerTargetKey[];
  /** Refeições cujos itens NUNCA são tocados (seção 31). */
  lockedMealKeys?: MealKey[];
  /** Itens específicos que nunca são tocados, identificados por posição "mealIndex:itemIndex" (seção 30) — DraftMealItem não tem id próprio. */
  lockedItemKeys?: string[];
  /** Distribuição energética opcional por refeição (seções 7-8). */
  mealDistribution?: MealDistributionEntry[];
  /** Peso da penalidade de distribuição por refeição no score global — só usado quando `mealDistribution` está presente. */
  mealDistributionWeight?: number;
  /** Variação relativa máxima em torno da quantidade ORIGINAL (fallback seguro, seção 12) — 0.5 a 2.0 por padrão. */
  relativeBounds?: { min: number; max: number };
  /** Teto técnico absoluto de proteção contra erro (seção 10) — NUNCA uma recomendação clínica de porção. */
  hardMaxGrams?: number;
}

export type OptimizerStopReason =
  | "WITHIN_TOLERANCE"
  | "NO_IMPROVEMENT"
  | "MAX_ITERATIONS"
  | "NO_MOVABLE_ITEMS"
  | "NO_ACTIVE_TARGETS";

export interface OptimizerNutritionSnapshot {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

export interface OptimizerAdjustment {
  mealIndex: number;
  mealName: string;
  itemIndex: number;
  food: string;
  displayName: string;
  quantityBefore: string;
  quantityAfter: string;
  unit: string;
}

export interface OptimizeDraftV2Result {
  meals: DraftMeal[];
  nutritionBefore: OptimizerNutritionSnapshot;
  /** SEMPRE vem de uma chamada real à engine (calculateDraftNutritionRaw) no final — nunca da soma incremental usada durante a busca (seção 39). */
  nutritionAfter: OptimizerNutritionSnapshot;
  scoreBefore: number;
  scoreAfter: number;
  iterations: number;
  stopReason: OptimizerStopReason;
  adjustments: OptimizerAdjustment[];
  activeTargets: OptimizerTargetKey[];
}

/** Teto técnico absoluto por padrão — proteção contra erro, nunca recomendação clínica (documentado seção 10). */
export const DEFAULT_HARD_MAX_GRAMS = 1500;
const DEFAULT_RELATIVE_MIN = 0.5;
const DEFAULT_RELATIVE_MAX = 2.0;
const MIN_ITEM_GRAMS = 1;
/** Passo prático de ajuste por unidade (seção 13) — nunca inventa conversão de medida caseira; só define o "grão" de ajuste pras unidades mais comuns. */
const STEP_GRAMS_ML = 5;
const STEP_UNIDADE = 1;
const STEP_GENERIC = 1;
/** Limite de segurança pra busca nunca rodar indefinidamente mesmo com maxIterations alto e muitos itens (seção 37: sub-segundo/poucos segundos). */
const DEFAULT_MAX_ITERATIONS = 60;

function stepForUnit(unit: string): number {
  const normalized = unit.trim().toLowerCase();
  if (normalized === "g" || normalized === "ml") return STEP_GRAMS_ML;
  if (normalized === "unidade") return STEP_UNIDADE;
  return STEP_GENERIC;
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function parseGrams(quantity: string): number | null {
  const value = Number(quantity.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Taxa por grama de cada item (seção 15/38) — resolvida UMA VEZ a partir da mesma referência que a engine usa, nunca uma segunda fonte de dado nutricional (só uma leitura derivada, matematicamente equivalente a `calculateItemNutrients` dividido pela grama). */
interface ItemRate {
  mealIndex: number;
  itemIndex: number;
  unit: string;
  originalGrams: number;
  kcalPerG: number;
  proteinPerG: number;
  carbPerG: number;
  fatPerG: number;
  fiberPerG: number;
}

function buildItemRates(
  meals: DraftMeal[],
  lookup: FoodReferenceLookup,
  lockedMealKeys: Set<MealKey>,
  lockedItemKeys: Set<string>
): ItemRate[] {
  const rates: ItemRate[] = [];
  meals.forEach((meal, mealIndex) => {
    if (lockedMealKeys.has(meal.mealKey)) return;
    meal.items.forEach((item, itemIndex) => {
      const key = `${mealIndex}:${itemIndex}`;
      if (lockedItemKeys.has(key)) return;
      // Seção 32: optimizer só pode alterar itens RESOLVED — itens com
      // segurança clínica não confirmada (CLINICAL_UNKNOWN) ficam de fora,
      // mais estrito que o V1 (que escalava tudo uniformemente).
      if (item.needsSafetyReview) return;
      const grams = parseGrams(item.quantity);
      if (grams === null) return;
      const reference = resolveItemReference(
        { food: item.food, food_source: item.food_source, food_ref_id: item.food_ref_id },
        lookup
      );
      if (!reference) return;
      rates.push({
        mealIndex,
        itemIndex,
        unit: item.unit,
        originalGrams: grams,
        kcalPerG: (reference.energia_kcal ?? 0) / 100,
        proteinPerG: (reference.proteina_g ?? 0) / 100,
        carbPerG: (reference.carboidrato_g ?? 0) / 100,
        fatPerG: (reference.lipidios_g ?? 0) / 100,
        fiberPerG: (reference.fibra_g ?? 0) / 100,
      });
    });
  });
  return rates;
}

function toSnapshot(v: { energyKcal: number | null; proteinG: number | null; carbohydrateG: number | null; fatG: number | null; fiberG?: number | null }): OptimizerNutritionSnapshot {
  return { energyKcal: v.energyKcal, proteinG: v.proteinG, carbohydrateG: v.carbohydrateG, fatG: v.fatG, fiberG: v.fiberG ?? null };
}

function deriveActiveTargets(target: OptimizerTarget, requested?: OptimizerTargetKey[]): OptimizerTargetKey[] {
  const available = ALL_TARGET_KEYS.filter((key) => {
    const value = key === "energy" ? target.energyKcal : key === "protein" ? target.proteinG : key === "carbohydrate" ? target.carbohydrateG : key === "fat" ? target.fatG : target.fiberG;
    return typeof value === "number" && value > 0;
  });
  if (!requested) return available;
  // Nunca "inventa" um eixo sem meta real, mesmo se pedido explicitamente (seção 5/25).
  return requested.filter((key) => available.includes(key));
}

function targetValue(target: OptimizerTarget, key: OptimizerTargetKey): number | null {
  const raw = key === "energy" ? target.energyKcal : key === "protein" ? target.proteinG : key === "carbohydrate" ? target.carbohydrateG : key === "fat" ? target.fatG : target.fiberG;
  return typeof raw === "number" && raw > 0 ? raw : null;
}

function currentValue(current: OptimizerNutritionSnapshot, key: OptimizerTargetKey): number {
  const raw = key === "energy" ? current.energyKcal : key === "protein" ? current.proteinG : key === "carbohydrate" ? current.carbohydrateG : key === "fat" ? current.fatG : current.fiberG;
  return raw ?? 0;
}

/**
 * Score determinístico (seção 4): soma dos erros RELATIVOS (|atual-meta|/meta)
 * de cada eixo ativo, ponderados. Erro relativo (não absoluto) foi a escolha
 * de normalização auditada — torna kcal (centenas) e gramas de macro
 * (dezenas) comparáveis na mesma escala sem fator de conversão arbitrário.
 * Menor é melhor; 0 = todas as metas ativas batidas exatamente.
 */
function computeScore(current: OptimizerNutritionSnapshot, target: OptimizerTarget, weights: OptimizerWeights, activeTargets: OptimizerTargetKey[]): number {
  let score = 0;
  for (const key of activeTargets) {
    const t = targetValue(target, key);
    if (t === null) continue;
    const c = currentValue(current, key);
    score += weights[key] * (Math.abs(c - t) / t);
  }
  return score;
}

function isWithinTolerance(current: OptimizerNutritionSnapshot, target: OptimizerTarget, tolerances: OptimizerTolerances, activeTargets: OptimizerTargetKey[]): boolean {
  const toleranceFor: Record<OptimizerTargetKey, number> = {
    energy: tolerances.energyPct,
    protein: tolerances.proteinPct,
    carbohydrate: tolerances.carbohydratePct,
    fat: tolerances.fatPct,
    fiber: tolerances.fiberPct,
  };
  return activeTargets.every((key) => {
    const t = targetValue(target, key);
    if (t === null) return true;
    const c = currentValue(current, key);
    return Math.abs(c - t) / t <= toleranceFor[key] / 100;
  });
}

export async function optimizeDraftToTargetV2(
  meals: DraftMeal[],
  target: OptimizerTarget,
  options: OptimizeDraftV2Options = {}
): Promise<OptimizeDraftV2Result> {
  const weights: OptimizerWeights = { ...DEFAULT_OPTIMIZER_WEIGHTS, ...options.weights };
  const tolerances: OptimizerTolerances = { ...DEFAULT_OPTIMIZER_TOLERANCES, ...options.tolerances };
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const relativeBounds = options.relativeBounds ?? { min: DEFAULT_RELATIVE_MIN, max: DEFAULT_RELATIVE_MAX };
  const hardMaxGrams = options.hardMaxGrams ?? DEFAULT_HARD_MAX_GRAMS;
  const lockedMealKeys = new Set(options.lockedMealKeys ?? []);
  const lockedItemKeys = new Set(options.lockedItemKeys ?? []);

  const initialRaw = await calculateDraftNutritionRaw(meals);
  const before = toSnapshot(initialRaw);
  const activeTargets = deriveActiveTargets(target, options.activeTargets);

  if (!activeTargets.length) {
    return { meals, nutritionBefore: before, nutritionAfter: before, scoreBefore: 0, scoreAfter: 0, iterations: 0, stopReason: "NO_ACTIVE_TARGETS", adjustments: [], activeTargets: [] };
  }

  const { references, measuresById } = await resolveMealPlanChangeReferences({ meals });
  const lookup = buildFoodReferenceLookup(references, measuresById);
  const rates = buildItemRates(meals, lookup, lockedMealKeys, lockedItemKeys);

  const scoreBefore = computeScore(before, target, weights, activeTargets);

  if (!rates.length) {
    return { meals, nutritionBefore: before, nutritionAfter: before, scoreBefore, scoreAfter: scoreBefore, iterations: 0, stopReason: "NO_MOVABLE_ITEMS", adjustments: [], activeTargets };
  }

  if (isWithinTolerance(before, target, tolerances, activeTargets)) {
    return { meals, nutritionBefore: before, nutritionAfter: before, scoreBefore, scoreAfter: scoreBefore, iterations: 0, stopReason: "WITHIN_TOLERANCE", adjustments: [], activeTargets };
  }

  // Estado de trabalho: grams atuais por item (mutável durante a busca) +
  // total PREVISTO incrementalmente a partir das taxas por grama — usado só
  // para RANQUEAR candidatos rapidamente (nunca é o resultado final, seção 39).
  const gramsByKey = new Map<string, number>(rates.map((r) => [`${r.mealIndex}:${r.itemIndex}`, r.originalGrams]));
  let predicted: OptimizerNutritionSnapshot = { ...before };

  function applyDelta(rate: ItemRate, deltaGrams: number) {
    predicted = {
      energyKcal: (predicted.energyKcal ?? 0) + rate.kcalPerG * deltaGrams,
      proteinG: (predicted.proteinG ?? 0) + rate.proteinPerG * deltaGrams,
      carbohydrateG: (predicted.carbohydrateG ?? 0) + rate.carbPerG * deltaGrams,
      fatG: (predicted.fatG ?? 0) + rate.fatPerG * deltaGrams,
      fiberG: (predicted.fiberG ?? 0) + rate.fiberPerG * deltaGrams,
    };
  }

  const mealDistribution = options.mealDistribution?.length ? options.mealDistribution : null;
  const mealDistributionWeight = options.mealDistributionWeight ?? 0.5;
  const totalEnergyTarget = targetValue(target, "energy");

  /** Penalidade de UMA refeição, dado seu kcal previsto — O(1). */
  function mealDistPenaltyFor(mealIndex: number, kcal: number): number {
    if (!mealDistribution || totalEnergyTarget === null) return 0;
    const meal = meals[mealIndex];
    const entry = mealDistribution.find((e) => e.mealKey === meal.mealKey);
    if (!entry) return 0;
    const mealTarget = totalEnergyTarget * (entry.percentage / 100);
    if (mealTarget <= 0) return 0;
    return mealDistributionWeight * (Math.abs(kcal - mealTarget) / mealTarget);
  }

  /** Soma das penalidades de TODAS as refeições no estado atual — só chamada pra baseline (O(refeições), sempre pequeno). */
  function totalDistributionPenalty(kcalByIndex: Map<number, number>): number {
    if (!mealDistribution) return 0;
    let sum = 0;
    for (const [idx, kcal] of kcalByIndex) sum += mealDistPenaltyFor(idx, kcal);
    return sum;
  }

  // Soma de energia atual por refeição (só recalculada quando há distribuição configurada — custo extra evitável no caso comum).
  const mealKcalByIndex = new Map<number, number>();
  if (mealDistribution) {
    rates.forEach((r) => {
      const grams = gramsByKey.get(`${r.mealIndex}:${r.itemIndex}`)!;
      mealKcalByIndex.set(r.mealIndex, (mealKcalByIndex.get(r.mealIndex) ?? 0) + r.kcalPerG * grams);
    });
  }

  let iterations = 0;
  let stopReason: OptimizerStopReason = "MAX_ITERATIONS";

  while (iterations < maxIterations) {
    if (isWithinTolerance(predicted, target, tolerances, activeTargets)) {
      stopReason = "WITHIN_TOLERANCE";
      break;
    }

    const currentScore = computeScore(predicted, target, weights, activeTargets) + totalDistributionPenalty(mealKcalByIndex);

    let bestCandidate: { rate: ItemRate; newGrams: number; score: number } | null = null;

    for (const rate of rates) {
      const key = `${rate.mealIndex}:${rate.itemIndex}`;
      const currentGrams = gramsByKey.get(key)!;
      const step = stepForUnit(rate.unit);
      const minGrams = Math.max(MIN_ITEM_GRAMS, rate.originalGrams * relativeBounds.min);
      const maxGrams = Math.min(hardMaxGrams, rate.originalGrams * relativeBounds.max);

      for (const direction of [1, -1]) {
        const rawNext = currentGrams + direction * step;
        const nextGrams = roundToStep(rawNext, step);
        if (nextGrams < minGrams || nextGrams > maxGrams || nextGrams <= 0) continue;
        const deltaGrams = nextGrams - currentGrams;
        if (deltaGrams === 0) continue;

        const candidatePredicted: OptimizerNutritionSnapshot = {
          energyKcal: (predicted.energyKcal ?? 0) + rate.kcalPerG * deltaGrams,
          proteinG: (predicted.proteinG ?? 0) + rate.proteinPerG * deltaGrams,
          carbohydrateG: (predicted.carbohydrateG ?? 0) + rate.carbPerG * deltaGrams,
          fatG: (predicted.fatG ?? 0) + rate.fatPerG * deltaGrams,
          fiberG: (predicted.fiberG ?? 0) + rate.fiberPerG * deltaGrams,
        };
        let candidateScore = computeScore(candidatePredicted, target, weights, activeTargets);
        if (mealDistribution) {
          // Só a refeição do candidato muda de kcal nesta jogada — troca só
          // a penalidade dela na soma total (O(1), nunca refaz o loop de refeições).
          const deltaKcal = rate.kcalPerG * deltaGrams;
          const mealKcalBefore = mealKcalByIndex.get(rate.mealIndex) ?? 0;
          candidateScore += totalDistributionPenalty(mealKcalByIndex)
            - mealDistPenaltyFor(rate.mealIndex, mealKcalBefore)
            + mealDistPenaltyFor(rate.mealIndex, mealKcalBefore + deltaKcal);
        }

        if (!bestCandidate || candidateScore < bestCandidate.score) {
          bestCandidate = { rate, newGrams: nextGrams, score: candidateScore };
        }
      }
    }

    // Nunca aceita um movimento que piora ou empata o score (seção 18:
    // "preferência monotonic improvement" — aqui é estrito, sem exceção de
    // plateau, porque plateau já é coberto pelo próprio NO_IMPROVEMENT).
    if (!bestCandidate || bestCandidate.score >= currentScore) {
      stopReason = "NO_IMPROVEMENT";
      break;
    }

    const { rate, newGrams } = bestCandidate;
    const key = `${rate.mealIndex}:${rate.itemIndex}`;
    const deltaGrams = newGrams - gramsByKey.get(key)!;
    gramsByKey.set(key, newGrams);
    applyDelta(rate, deltaGrams);
    if (mealDistribution) {
      mealKcalByIndex.set(rate.mealIndex, (mealKcalByIndex.get(rate.mealIndex) ?? 0) + rate.kcalPerG * deltaGrams);
    }
    iterations += 1;
  }

  // Monta o draft final a partir das grams ajustadas — só os itens que
  // realmente mudaram viram "adjustments" auditáveis (seção 21).
  const adjustments: OptimizerAdjustment[] = [];
  const optimizedMeals: DraftMeal[] = meals.map((meal, mealIndex) => ({
    ...meal,
    items: meal.items.map((item, itemIndex) => {
      const key = `${mealIndex}:${itemIndex}`;
      if (!gramsByKey.has(key)) return item;
      const newGrams = gramsByKey.get(key)!;
      const originalGrams = parseGrams(item.quantity);
      if (originalGrams === null || newGrams === originalGrams) return item;
      adjustments.push({
        mealIndex,
        mealName: meal.name,
        itemIndex,
        food: item.food,
        displayName: item.displayName,
        quantityBefore: item.quantity,
        quantityAfter: String(newGrams),
        unit: item.unit,
      });
      return { ...item, quantity: String(newGrams) };
    }),
  }));

  // Seção 39: NUNCA confia no total previsto pela busca — recalcula pela
  // engine real antes de responder. Esse é o resultado oficial.
  const finalRaw = await calculateDraftNutritionRaw(optimizedMeals);
  const after = toSnapshot(finalRaw);
  const scoreAfter = computeScore(after, target, weights, activeTargets);

  return {
    meals: optimizedMeals,
    nutritionBefore: before,
    nutritionAfter: after,
    scoreBefore,
    scoreAfter,
    iterations,
    stopReason,
    adjustments,
    activeTargets,
  };
}

export type { MacroReferenceFood };
