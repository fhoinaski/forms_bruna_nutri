import type { NutrientTarget } from "@/lib/nutrition/targets";
import type { DraftMeal } from "@/lib/nutrition/draft-types";
import { calculateDraftNutritionRaw } from "@/lib/nutrition/draft-nutrition";

/**
 * Ajuste DETERMINÍSTICO de quantidades em direção à meta — o LLM nunca
 * "tenta calcular até bater a meta" (seção 11 do pedido). Estratégia:
 * escala proporcionalmente as gramas dos itens JÁ RESOLVIDOS pelo fator
 * necessário pra aproximar a energia da meta — nunca troca um alimento por
 * outro (isso exigiria nova proposta/resolução/safety, seção 15), nunca
 * inventa um alimento novo. Escalar proporcionalmente preserva a
 * distribuição relativa entre proteína/carboidrato/gordura (se o prato
 * tinha um perfil razoável, continua tendo, só maior/menor) — não é uma
 * otimização multi-objetivo perfeita, mas é transparente, previsível e
 * nunca destrói uma meta pra consertar outra.
 *
 * A tolerância (±5% por padrão) é só um critério técnico de UX/parada —
 * NUNCA uma regra clínica (seção 13 do pedido). Fica isolada em
 * `DEFAULT_TOLERANCE_PERCENT`, documentada, configurável pelo chamador.
 */

export const DEFAULT_TOLERANCE_PERCENT = 5;
export const DEFAULT_MAX_ITERATIONS = 4;
const MIN_SCALE_FACTOR = 0.5;
const MAX_SCALE_FACTOR = 2;
const MIN_ITEM_GRAMS = 1;
const MAX_ITEM_GRAMS = 3000;

export interface OptimizeDraftOptions {
  maxIterations?: number;
  tolerancePercent?: number;
}

export interface OptimizeDraftResult {
  meals: DraftMeal[];
  iterations: number;
  before: { energyKcal: number | null; proteinG: number | null; carbohydrateG: number | null; fatG: number | null };
  after: { energyKcal: number | null; proteinG: number | null; carbohydrateG: number | null; fatG: number | null };
  withinTolerance: boolean;
}

function scaleMeals(meals: DraftMeal[], factor: number): DraftMeal[] {
  return meals.map((meal) => ({
    ...meal,
    items: meal.items.map((item) => {
      const currentGrams = Number(item.quantity.replace(",", "."));
      if (!Number.isFinite(currentGrams) || currentGrams <= 0) return item;
      const nextGrams = Math.min(MAX_ITEM_GRAMS, Math.max(MIN_ITEM_GRAMS, Math.round(currentGrams * factor * 10) / 10));
      return { ...item, quantity: String(nextGrams) };
    }),
  }));
}

function isWithinTolerance(current: number | null, target: number | null, tolerancePercent: number): boolean {
  if (target === null || target === 0) return true; // sem meta definida, nada a otimizar nesse eixo
  if (current === null) return false;
  return Math.abs(current - target) / target <= tolerancePercent / 100;
}

/**
 * Roda até `maxIterations` passes de escala proporcional, parando assim
 * que a energia entrar na tolerância (ou se não houver meta de energia —
 * nesse caso não há o que otimizar, retorna o draft original sem
 * iterações, nunca inventa uma meta pra ter o que ajustar).
 */
export async function optimizeDraftToTarget(
  meals: DraftMeal[],
  target: NutrientTarget,
  options: OptimizeDraftOptions = {}
): Promise<OptimizeDraftResult> {
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tolerancePercent = options.tolerancePercent ?? DEFAULT_TOLERANCE_PERCENT;

  const initial = await calculateDraftNutritionRaw(meals);
  const before = { energyKcal: initial.energyKcal, proteinG: initial.proteinG, carbohydrateG: initial.carbohydrateG, fatG: initial.fatG };

  if (target.energyKcal === null || target.energyKcal === undefined) {
    return { meals, iterations: 0, before, after: before, withinTolerance: true };
  }

  let currentMeals = meals;
  let current = initial;
  let iterations = 0;

  while (iterations < maxIterations && !isWithinTolerance(current.energyKcal, target.energyKcal, tolerancePercent)) {
    if (current.energyKcal === null || current.energyKcal <= 0) break; // nada calculável pra escalar (ex.: todos os itens sem referência)
    const rawFactor = target.energyKcal / current.energyKcal;
    const factor = Math.min(MAX_SCALE_FACTOR, Math.max(MIN_SCALE_FACTOR, rawFactor));
    currentMeals = scaleMeals(currentMeals, factor);
    current = await calculateDraftNutritionRaw(currentMeals);
    iterations += 1;
    // Fator preso no limite (ex.: precisaria dobrar de novo mas MAX_SCALE_FACTOR
    // já barrou) e sem progresso real -> para, não fica girando em roda.
    if (factor === MIN_SCALE_FACTOR || factor === MAX_SCALE_FACTOR) {
      if (Math.abs(rawFactor - factor) > 0.01) break;
    }
  }

  const after = { energyKcal: current.energyKcal, proteinG: current.proteinG, carbohydrateG: current.carbohydrateG, fatG: current.fatG };
  return {
    meals: currentMeals,
    iterations,
    before,
    after,
    withinTolerance: isWithinTolerance(current.energyKcal, target.energyKcal, tolerancePercent),
  };
}
