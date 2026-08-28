import { calculatePlanNutrients, roundedNutrients, type NutrientValues } from "@/lib/nutrition/nutrients";
import { compareTargetVsPrescribed, type NutrientTarget, type TargetComparisonRow } from "@/lib/nutrition/targets";
import { resolveMealPlanChangeReferences, buildFoodReferenceLookup } from "@/lib/ai/agents/nutrition/meal-plan-change-agent";
import type { DraftMeal } from "@/lib/nutrition/draft-types";
import { draftMealToMealFlex } from "@/lib/nutrition/draft-meal-flex";
import { calculateMealNutritionRange, type FlexibleNutrientValues } from "@/lib/meal-plans/flexible-structure";
import type { MealPlanItemPayload } from "@/lib/repositories/meal-plans";

/**
 * Adaptador: DraftMeal[] → engine nutricional canônica. Este é o passo que
 * faltava (seção 9 do pedido) — o draft agora é calculável ANTES de
 * aplicar ao editor, usando exatamente `calculatePlanNutrients`
 * (lib/nutrition/nutrients.ts), a MESMA engine do editor e da impressão.
 * Nunca uma fórmula própria aqui — só resolve as referências (mesmo
 * helper já usado por resolveMealPlanChangeReferences em
 * meal-plan-change-agent.ts, reaproveitado, não duplicado) e delega o
 * cálculo.
 */
export interface DraftNutritionSummary {
  total: NutrientValues;
  perMeal: NutrientValues[];
  unresolvedCount: number;
  targetComparison: TargetComparisonRow[];
  /** Faixa do Meal Flex; em SIMPLE min=max. OPTIONS nunca é somado. */
  range?: { min: NutrientValues; max: NutrientValues; varies: boolean };
}

export async function calculateDraftNutrition(meals: DraftMeal[], target: NutrientTarget): Promise<DraftNutritionSummary> {
  const flexMeals = meals.map(draftMealToMealFlex);
  const plan = { meals: flexMeals };
  const { references, measuresById } = await resolveMealPlanChangeReferences(plan);
  const lookup = buildFoodReferenceLookup(references, measuresById);
  // calculatePlanNutrients é a autoridade por item. Meal Flex decide apenas
  // como combinar os valores (opções são alternativas, não uma soma).
  const itemValues = new Map<MealPlanItemPayload, FlexibleNutrientValues>();
  const valueFor = (item: MealPlanItemPayload): FlexibleNutrientValues => {
    const cached = itemValues.get(item);
    if (cached) return cached;
    const values = calculatePlanNutrients({ meals: [{ name: "item", items: [item] }] }, lookup).total.values;
    const value = { energyKcal: values.energyKcal ?? 0, proteinG: values.proteinG ?? 0, carbohydrateG: values.carbohydrateG ?? 0, fatG: values.fatG ?? 0, fiberG: values.fiberG ?? 0 };
    itemValues.set(item, value);
    return value;
  };
  const ranges = flexMeals.map((meal) => calculateMealNutritionRange(meal, valueFor));
  const keys: Array<keyof FlexibleNutrientValues> = ["energyKcal", "proteinG", "carbohydrateG", "fatG", "fiberG"];
  const rangeTotal = ranges.reduce((total, range) => {
    for (const key of keys) { total.min[key] += range.min[key]; total.max[key] += range.max[key]; }
    total.varies ||= range.varies;
    return total;
  }, { min: { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0 }, max: { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0 }, varies: false });
  const result = calculatePlanNutrients({ meals: flexMeals.map((meal) => ({ ...meal, items: [
    ...meal.items,
    ...(meal.options ?? []).flatMap((option) => option.items),
    ...(meal.choice_groups ?? []).flatMap((group) => group.items),
  ] })) }, lookup);
  const minTotal = { ...result.total.values, ...rangeTotal.min };
  const maxTotal = { ...result.total.values, ...rangeTotal.max };
  // Preserva a semântica histórica de ausência: uma refeição vazia não é
  // “0 kcal”. Em SIMPLE a engine retorna exatamente o total anterior.
  const selectedTotal = rangeTotal.varies ? minTotal : result.total.values;
  return {
    total: roundedNutrients(selectedTotal),
    perMeal: ranges.map((range, index) => roundedNutrients(range.varies ? { ...result.perMeal[index]!.values, ...range.min } : result.perMeal[index]!.values)),
    unresolvedCount: result.quality.unresolved,
    targetComparison: compareTargetVsPrescribed(target, selectedTotal),
    range: { min: roundedNutrients(minTotal), max: roundedNutrients(maxTotal), varies: rangeTotal.varies },
  };
}

/** Versão sem arredondamento — usada internamente pelo optimizer, que precisa de precisão total pra calcular fatores de escala (arredondar cedo demais distorceria o ajuste). */
export async function calculateDraftNutritionRaw(meals: DraftMeal[]): Promise<NutrientValues> {
  const plan = { meals: meals.map(draftMealToMealFlex) };
  const { references, measuresById } = await resolveMealPlanChangeReferences(plan);
  const lookup = buildFoodReferenceLookup(references, measuresById);
  return calculatePlanNutrients(plan, lookup).total.values;
}
