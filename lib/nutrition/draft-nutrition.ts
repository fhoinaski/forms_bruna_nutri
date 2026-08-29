import { calculatePlanNutrients, calculateFlexiblePlanNutrients, roundedNutrients, type NutrientValues } from "@/lib/nutrition/nutrients";
import { compareTargetVsPrescribed, type NutrientTarget, type TargetComparisonRow } from "@/lib/nutrition/targets";
import { resolveMealPlanChangeReferences, buildFoodReferenceLookup } from "@/lib/ai/agents/nutrition/meal-plan-change-agent";
import type { DraftMeal } from "@/lib/nutrition/draft-types";

/**
 * Adaptador: DraftMeal[] → engine nutricional canônica. Este é o passo que
 * faltava (seção 9 do pedido) — o draft agora é calculável ANTES de
 * aplicar ao editor, usando exatamente a engine real
 * (lib/nutrition/nutrients.ts), a MESMA do editor e da impressão. Nunca
 * uma fórmula própria aqui — só resolve as referências (mesmo helper já
 * usado por resolveMealPlanChangeReferences em meal-plan-change-agent.ts,
 * reaproveitado, não duplicado) e delega o cálculo.
 *
 * R5.1 (seções 7/32/35/36/37): usa `calculateFlexiblePlanNutrients` em vez
 * de `calculatePlanNutrients` — a MESMA engine já usada pelo Composer pra
 * OPTIONS/COMBINATION manuais (nunca uma segunda lógica de range pro
 * Copilot). Para um draft 100% SIMPLE (todo `meal_structure` ausente/null),
 * min===max sempre, então `total`/`perMeal` continuam numericamente
 * idênticos ao comportamento anterior — nenhuma regressão. Quando o draft
 * tem OPTIONS/COMBINATION, `total`/`perMeal` mostram o teto (`max`, nunca
 * soma de alternativas) e `totalRange`/`perMealRange` carregam o contrato
 * completo min/max/varies para quem quiser exibir a faixa.
 */
export interface DraftNutritionSummary {
  total: NutrientValues;
  perMeal: NutrientValues[];
  /** R5.1 — presente sempre; `varies` é false para drafts 100% SIMPLE. */
  totalRange: { min: NutrientValues; max: NutrientValues; varies: boolean };
  perMealRange: { min: NutrientValues; max: NutrientValues; varies: boolean }[];
  unresolvedCount: number;
  targetComparison: TargetComparisonRow[];
}

export async function calculateDraftNutrition(meals: DraftMeal[], target: NutrientTarget): Promise<DraftNutritionSummary> {
  const plan = { meals };
  const { references, measuresById } = await resolveMealPlanChangeReferences(plan);
  const lookup = buildFoodReferenceLookup(references, measuresById);
  const result = calculateFlexiblePlanNutrients(plan, lookup);
  return {
    total: roundedNutrients(result.total.max),
    perMeal: result.perMeal.map((meal) => roundedNutrients(meal.max)),
    totalRange: { min: roundedNutrients(result.total.min), max: roundedNutrients(result.total.max), varies: result.total.varies },
    perMealRange: result.perMeal.map((meal) => ({ min: roundedNutrients(meal.min), max: roundedNutrients(meal.max), varies: meal.varies })),
    unresolvedCount: result.quality.unresolved,
    targetComparison: compareTargetVsPrescribed(target, result.total.max),
  };
}

/**
 * Versão sem arredondamento — usada internamente pelo optimizer, que
 * precisa de precisão total pra calcular fatores de escala (arredondar
 * cedo demais distorceria o ajuste). Deliberadamente mantida em cima de
 * `calculatePlanNutrients` (só itens fixos/`meal.items`, sem OPTIONS/
 * COMBINATION) — o Optimizer V2 nunca foi pedido para ajustar refeições
 * flexíveis nesta fase (R5.1 não estende o optimizer); ele já opera hoje
 * só sobre `meal.items` de cada refeição, então uma refeição OPTIONS/
 * COMBINATION simplesmente não tem seus itens nested contados/ajustados
 * por ele — comportamento seguro (nunca ajusta o que não entende), mas
 * documentado aqui como limite de escopo consciente, não um bug.
 */
export async function calculateDraftNutritionRaw(meals: DraftMeal[]): Promise<NutrientValues> {
  const plan = { meals };
  const { references, measuresById } = await resolveMealPlanChangeReferences(plan);
  const lookup = buildFoodReferenceLookup(references, measuresById);
  return calculatePlanNutrients(plan, lookup).total.values;
}
