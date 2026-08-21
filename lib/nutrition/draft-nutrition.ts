import { calculatePlanNutrients, roundedNutrients, type NutrientValues } from "@/lib/nutrition/nutrients";
import { compareTargetVsPrescribed, type NutrientTarget, type TargetComparisonRow } from "@/lib/nutrition/targets";
import { resolveMealPlanChangeReferences, buildFoodReferenceLookup } from "@/lib/ai/agents/nutrition/meal-plan-change-agent";
import type { DraftMeal } from "@/lib/nutrition/draft-types";

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
}

export async function calculateDraftNutrition(meals: DraftMeal[], target: NutrientTarget): Promise<DraftNutritionSummary> {
  const plan = { meals };
  const { references, measuresById } = await resolveMealPlanChangeReferences(plan);
  const lookup = buildFoodReferenceLookup(references, measuresById);
  const result = calculatePlanNutrients(plan, lookup);
  return {
    total: roundedNutrients(result.total.values),
    perMeal: result.perMeal.map((meal) => roundedNutrients(meal.values)),
    unresolvedCount: result.quality.unresolved,
    targetComparison: compareTargetVsPrescribed(target, result.total.values),
  };
}

/** Versão sem arredondamento — usada internamente pelo optimizer, que precisa de precisão total pra calcular fatores de escala (arredondar cedo demais distorceria o ajuste). */
export async function calculateDraftNutritionRaw(meals: DraftMeal[]): Promise<NutrientValues> {
  const plan = { meals };
  const { references, measuresById } = await resolveMealPlanChangeReferences(plan);
  const lookup = buildFoodReferenceLookup(references, measuresById);
  return calculatePlanNutrients(plan, lookup).total.values;
}
