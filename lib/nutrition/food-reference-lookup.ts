import { TACO_REFERENCES, getTacoFoodByNumber } from "@/lib/nutrition/taco";
import { findBestFoodReference, type MacroReferenceFood } from "@/lib/nutrition/macros";
import { type FoodReferenceLookup, type RecipeReferenceEntry } from "@/lib/nutrition/nutrients";
import { getCustomFoodById, toMacroReferenceFood } from "@/lib/repositories/custom-foods";
import { getFoodPortionById, toHouseholdMeasureOption, type FoodPortion } from "@/lib/repositories/food-portions";
import type { MealPlanPayload } from "@/lib/repositories/meal-plans";
import type { MealPlanChangeOperation } from "@/lib/ai/schemas/action.schema";

/**
 * Construção de `FoodReferenceLookup` — extraído de
 * `lib/ai/agents/nutrition/meal-plan-change-agent.ts` (que continua
 * reexportando os dois nomes por compatibilidade, nenhum importador
 * existente precisa mudar) pra um módulo neutro em lib/nutrition/, porque
 * R6 precisa que `lib/repositories/recipes.ts` também construa um lookup
 * (pros ingredientes de uma receita) — importar de um arquivo "agente de
 * IA" criaria uma dependência de camada estranha, e pior, um import
 * circular real (recipes.ts já é importado por meal-plans.ts, que por sua
 * vez seria importado pelo agente).
 */

/**
 * Coleta todo refId CUSTOM/MANUFACTURER, householdMeasureId e recipeId
 * mencionados nas mudanças propostas (mais os já existentes nos itens do
 * plano) e busca tudo de uma vez — nunca N+1, nunca dentro do loop
 * síncrono de aplicação.
 */
export async function resolveMealPlanChangeReferences(
  plan: Pick<MealPlanPayload, "meals">,
  changes: MealPlanChangeOperation[] = []
): Promise<{ references: MacroReferenceFood[]; measuresById: Map<string, FoodPortion>; recipeIds: string[] }> {
  const customRefIds = new Set<string>();
  const measureIds = new Set<string>();
  const recipeIds = new Set<string>();

  for (const change of changes) {
    if ("food" in change && (change.food.source === "CUSTOM" || change.food.source === "MANUFACTURER")) {
      customRefIds.add(change.food.refId);
    }
    if ("optionFood" in change && (change.optionFood.source === "CUSTOM" || change.optionFood.source === "MANUFACTURER")) {
      customRefIds.add(change.optionFood.refId);
    }
    if ("householdMeasureId" in change && change.householdMeasureId) {
      measureIds.add(change.householdMeasureId);
    }
  }
  // FASE 4B: tambem os itens JA EXISTENTES no plano (nao so os tocados por
  // `changes`) — sem isso, um item CUSTOM/MANUFACTURER que a mudanca atual
  // nao toca ficava sem referencia estruturada disponivel (caindo pra fuzzy
  // match por texto em vez do vinculo exato), tanto no preview de "antes"
  // quanto no calculo de totalVsTarget.
  for (const meal of plan.meals) {
    const structuredItems = [meal.items, ...(meal.options ?? []).map((option) => option.items), ...(meal.choice_groups ?? []).map((group) => group.items)].flat();
    for (const item of structuredItems) {
      if ((item.food_source === "CUSTOM" || item.food_source === "MANUFACTURER") && item.food_ref_id) {
        customRefIds.add(item.food_ref_id);
      }
      if (item.household_measure_id) measureIds.add(item.household_measure_id);
      // R6 — recipeIds coletados aqui, mas resolvidos pelo CHAMADOR (não
      // por este módulo, que não deve depender de lib/repositories/recipes.ts
      // pra não reintroduzir o ciclo) via getRecipeReferenceEntriesByIds.
      if (item.food_source === "RECIPE" && item.food_ref_id) recipeIds.add(item.food_ref_id);
    }
  }

  const [customFoods, portions] = await Promise.all([
    Promise.all(Array.from(customRefIds).map((id) => getCustomFoodById(id))),
    Promise.all(Array.from(measureIds).map((id) => getFoodPortionById(id))),
  ]);

  const references: MacroReferenceFood[] = [
    ...TACO_REFERENCES,
    ...customFoods.filter((food): food is NonNullable<typeof food> => Boolean(food)).map(toMacroReferenceFood),
  ];
  const measuresById = new Map<string, FoodPortion>();
  for (const portion of portions) {
    if (portion) measuresById.set(portion.id, portion);
  }
  return { references, measuresById, recipeIds: Array.from(recipeIds) };
}

/**
 * Adapta `references`/`measuresById` (já resolvidos, sem I/O adicional)
 * pro formato `FoodReferenceLookup` que o motor central de nutrientes
 * (lib/nutrition/nutrients.ts) espera. `recipesById` é opcional (R6) —
 * ausente/vazio, item de receita simplesmente fica "não reconhecido",
 * nunca quebra chamadores anteriores a esta fase.
 */
export function buildFoodReferenceLookup(
  references: MacroReferenceFood[],
  measuresById: Map<string, FoodPortion>,
  recipesById?: Map<string, RecipeReferenceEntry>
): FoodReferenceLookup {
  return {
    byTacoNumber: (numero) => getTacoFoodByNumber(numero),
    byCustomId: (id) => references.find((reference) => (reference.fonte === "custom" || reference.fonte === "manufacturer") && String(reference.numero ?? "") === id) ?? null,
    fuzzyMatch: (food) => findBestFoodReference(food, references),
    byMeasureId: (id) => {
      const portion = measuresById.get(id);
      return portion ? toHouseholdMeasureOption(portion) : null;
    },
    byRecipeId: recipesById ? (id) => recipesById.get(id) ?? null : undefined,
  };
}

