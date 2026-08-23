import { z } from "zod";
import { getMealPlanById, getClientMealPlans, type MealPlanMealPayload, type MealPlanItemPayload, type MealPlanPayload, type MealPlanSubstitutionPayload } from "@/lib/repositories/meal-plans";
import { findFoodSubstitutes } from "@/lib/nutrition/substitution-engine";
import { classifyFoodExchangeGroup } from "@/lib/nutrition/food-exchange-hierarchy";
import { toDisplayFoodName } from "@/lib/nutrition/food-resolver";
import { searchTacoFoods, getTacoFoodByNumber, findBestTacoFood, TACO_REFERENCES } from "@/lib/nutrition/taco";
import { resolveFoodItemMacros, roundedMacros, findFoodReferenceByIdentity, findBestFoodReference, type MacroReferenceFood } from "@/lib/nutrition/macros";
import type { HouseholdMeasureOption, QuantityResolution } from "@/lib/nutrition/quantity-resolution";
import { calculatePlanNutrients, roundedNutrients, type FoodReferenceLookup } from "@/lib/nutrition/nutrients";
import { compareTargetVsPrescribed, type NutrientTarget } from "@/lib/nutrition/targets";
import { findEquivalentFoods as findEquivalentFoodsEngine } from "@/lib/nutrition/equivalence";
import { getCustomFoodById, toMacroReferenceFood } from "@/lib/repositories/custom-foods";
import { getFoodPortionById, toHouseholdMeasureOption, type FoodPortion } from "@/lib/repositories/food-portions";
import {
  mealPlanChangeOperationSchema,
  type MealPlanChangeOperation,
  type MealPlanFoodReference,
  type MealPlanMeasureUnit,
  type MealPlanChangePreview,
} from "@/lib/ai/schemas/action.schema";
import { assertCategoryAllowed } from "@/lib/ai/policies/clinical-context-policy";

/**
 * Agente/tools para alteracoes estruturadas do plano alimentar (nao mais
 * texto solto no prontuario). `applyMealPlanChangesWithPreview` e a UNICA
 * logica de mutacao — usada tanto pela tool (para montar o preview, sem
 * persistir nada) quanto pelo handler de confirmacao
 * (lib/ai/core/proposal-handlers.ts, que aplica de verdade via
 * updateMealPlan). Isso garante que o preview mostrado nunca diverge do que
 * realmente sera aplicado.
 *
 * FASE 4 (safe writes de plano alimentar): `food_source`/`food_ref_id`/
 * `household_measure_id` — as MESMAS colunas que o editor manual usa — sao
 * persistidos a partir de `source`/`refId`/`householdMeasureId`, nunca so o
 * nome digitado. `references`/`measuresById` abaixo sao pre-resolvidos de
 * forma assincrona ANTES de chamar o motor de aplicacao (que continua
 * puro/sincrono, mesmo desenho de antes desta fase).
 */

export const SEARCH_MEAL_PLAN_FOODS_TOOL_NAME = "searchMealPlanFoods";
export const PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME = "proposeMealPlanChange";

export const searchMealPlanFoodsInputSchema = z.object({
  query: z.string().min(2).max(120),
}).strict();
export type SearchMealPlanFoodsInput = z.infer<typeof searchMealPlanFoodsInputSchema>;

export async function executeSearchMealPlanFoods(input: SearchMealPlanFoodsInput) {
  return {
    items: searchTacoFoods(input.query, 10).map((food) => ({
      tacoNumber: typeof food.numero === "number" ? food.numero : Number(food.numero),
      descricao: food.descricao,
      grupo: food.grupo ?? null,
      kcal_100g: food.energia_kcal,
      proteina_100g: food.proteina_g,
      carboidrato_100g: food.carboidrato_g,
      gordura_100g: food.lipidios_g,
    })),
  };
}

export const proposeMealPlanChangeInputSchema = z.object({
  mealPlanId: z.string().min(1),
  baseVersion: z.number().int().positive(),
  changes: z.array(mealPlanChangeOperationSchema).min(1).max(20),
}).strict();
export type ProposeMealPlanChangeInput = z.infer<typeof proposeMealPlanChangeInputSchema>;

export type ProposeMealPlanChangeOutput =
  | { error: string }
  | { clientId: string; mealPlanId: string; baseVersion: number; changes: MealPlanChangeOperation[]; preview: MealPlanChangePreview };

export class MealPlanChangeValidationError extends Error {}

function findMeal(meals: MealPlanMealPayload[], mealId: string): MealPlanMealPayload {
  const meal = meals.find((item) => item.id === mealId);
  if (!meal) throw new MealPlanChangeValidationError(`Refeição não encontrada no plano (id: ${mealId}). Peça para reler o plano atual.`);
  return meal;
}

function findItemIndex(meal: MealPlanMealPayload, itemId: string): number {
  const index = meal.items.findIndex((item) => item.id === itemId);
  if (index === -1) {
    throw new MealPlanChangeValidationError(`Item não encontrado na refeição "${meal.name}" (id: ${itemId}). Peça para reler o plano atual.`);
  }
  return index;
}

function describeItem(food: string, quantity?: string | null, unit?: string | null): string {
  return quantity ? `${food} — ${quantity}${unit ?? ""}` : food;
}

// ── Pre-resolucao assincrona de referencias (fora do motor puro/sincrono) ──

/**
 * Coleta todo refId CUSTOM/MANUFACTURER e todo householdMeasureId
 * mencionados nas mudancas propostas (mais os household_measure_id dos
 * itens JA existentes no plano, para o calculo do estado "antes" ficar tao
 * preciso quanto o que a UI ja mostra) e busca tudo de uma vez — nunca N+1,
 * nunca dentro do loop sincrono de aplicacao.
 */
export async function resolveMealPlanChangeReferences(
  plan: Pick<MealPlanPayload, "meals">,
  changes: MealPlanChangeOperation[] = []
): Promise<{ references: MacroReferenceFood[]; measuresById: Map<string, FoodPortion> }> {
  const customRefIds = new Set<string>();
  const measureIds = new Set<string>();

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
    for (const item of meal.items) {
      if ((item.food_source === "CUSTOM" || item.food_source === "MANUFACTURER") && item.food_ref_id) {
        customRefIds.add(item.food_ref_id);
      }
      if (item.household_measure_id) measureIds.add(item.household_measure_id);
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
  return { references, measuresById };
}

/**
 * FASE 4B: adapta `references`/`measuresById` (ja resolvidos, sem I/O
 * adicional) para o formato `FoodReferenceLookup` que o motor central de
 * nutrientes (lib/nutrition/nutrients.ts#calculatePlanNutrients) espera —
 * a MESMA engine usada pelo resto do sistema, nunca um calculo paralelo
 * para a IA. `byUsdaId` fica deliberadamente ausente: nao existe hoje
 * nenhum repositorio/fonte de dado USDA no projeto (auditado nesta fase) —
 * um item com food_source "USDA" cai no fallback fuzzyMatch, mesmo
 * comportamento de antes desta correcao, nunca um dado inventado.
 */
export function buildFoodReferenceLookup(
  references: MacroReferenceFood[],
  measuresById: Map<string, FoodPortion>
): FoodReferenceLookup {
  return {
    byTacoNumber: (numero) => getTacoFoodByNumber(numero),
    byCustomId: (id) => references.find((reference) => (reference.fonte === "custom" || reference.fonte === "manufacturer") && String(reference.numero ?? "") === id) ?? null,
    fuzzyMatch: (food) => findBestFoodReference(food, references),
    byMeasureId: (id) => {
      const portion = measuresById.get(id);
      return portion ? toHouseholdMeasureOption(portion) : null;
    },
  };
}

/**
 * Valida que todo `food` referenciado nas mudancas corresponde a um
 * registro real no catalogo (TACO/CUSTOM/MANUFACTURER) — nunca so o nome
 * digitado (FASE 4, item 3 do pedido). Chamada tanto na criacao da proposta
 * quanto de novo na confirmacao (nunca confia no que foi resolvido antes).
 */
export function validateMealPlanFoodReferences(changes: MealPlanChangeOperation[], references: MacroReferenceFood[]): string | null {
  for (const change of changes) {
    if ("food" in change) {
      const found = findFoodReferenceByIdentity(references, change.food.source, change.food.refId);
      if (!found) {
        return `O alimento "${change.food.foodName}" não corresponde a um registro válido (${change.food.source}/${change.food.refId}). Busque de novo com searchFoods.`;
      }
    }
    if ("optionFood" in change) {
      const found = findFoodReferenceByIdentity(references, change.optionFood.source, change.optionFood.refId);
      if (!found) {
        return `O alimento "${change.optionFood.foodName}" não corresponde a um registro válido (${change.optionFood.source}/${change.optionFood.refId}). Busque de novo com searchFoods.`;
      }
    }
  }
  return null;
}

/** Resolve os macros de um FoodReference estruturado (TACO/CUSTOM/MANUFACTURER) — nunca reimplementa o calculo, so aciona o motor central com a referencia certa. */
function resolveFoodMacros(
  food: MealPlanFoodReference,
  quantity: number,
  unit: MealPlanMeasureUnit,
  references: MacroReferenceFood[],
  householdMeasure?: HouseholdMeasureOption | null
) {
  const reference = findFoodReferenceByIdentity(references, food.source, food.refId);
  if (reference) {
    return resolveFoodItemMacros({ food: reference.descricao, quantity, unit }, [reference], householdMeasure ?? null);
  }
  return resolveFoodItemMacros({ food: food.foodName, quantity, unit }, references, householdMeasure ?? null);
}

function householdMeasureFor(item: Pick<MealPlanItemPayload, "household_measure_id">, measuresById: Map<string, FoodPortion>): HouseholdMeasureOption | null {
  if (!item.household_measure_id) return null;
  const portion = measuresById.get(item.household_measure_id);
  return portion ? toHouseholdMeasureOption(portion) : null;
}

function existingItemMacros(item: MealPlanItemPayload, references: MacroReferenceFood[], measuresById: Map<string, FoodPortion>) {
  return resolveFoodItemMacros(
    {
      food: item.food,
      quantity: item.quantity,
      unit: item.unit,
      food_source: item.food_source,
      food_ref_id: item.food_ref_id,
      resolved_grams_snapshot: item.resolved_grams_snapshot,
      quantity_resolution_snapshot: item.quantity_resolution_snapshot,
    },
    references,
    householdMeasureFor(item, measuresById)
  );
}

interface MacroDelta { kcal: number; protein: number; carbs: number; fat: number }
const ZERO_DELTA: MacroDelta = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

function addDelta(total: MacroDelta, before: MacroDelta, after: MacroDelta): MacroDelta {
  return {
    kcal: total.kcal + (after.kcal - before.kcal),
    protein: total.protein + (after.protein - before.protein),
    carbs: total.carbs + (after.carbs - before.carbs),
    fat: total.fat + (after.fat - before.fat),
  };
}

export interface MealPlanChangeApplyResult {
  meals: MealPlanMealPayload[];
  substitutions: MealPlanSubstitutionPayload[];
  preview: MealPlanChangePreview;
}

/**
 * Aplica as operacoes estruturadas sobre uma copia em memoria do array de
 * refeicoes (nunca muta o array recebido) e, ao mesmo tempo, monta o preview
 * (resumo antes/depois por operacao + impacto total de macros). Lanca
 * MealPlanChangeValidationError se algum mealId/itemId referenciado nao
 * existir no snapshot recebido, se uma medida caseira nao pertencer ao
 * alimento, ou se um reorder nao for uma permutacao exata dos ids atuais —
 * isso so deveria acontecer se o modelo inventou algo ou se o plano mudou
 * entre a leitura e a proposta/confirmacao (por isso o baseVersion e checado
 * ANTES de chamar isto, tanto na criacao da proposta quanto na confirmacao).
 *
 * `references`/`measuresById` sao pre-resolvidos por
 * `resolveMealPlanChangeReferences` (assincrono) ANTES desta chamada — este
 * motor continua puro/sincrono, mesmo desenho de antes da FASE 4.
 */
export function applyMealPlanChangesWithPreview(
  meals: MealPlanMealPayload[],
  changes: MealPlanChangeOperation[],
  mealPlanTitle: string,
  target?: NutrientTarget,
  references: MacroReferenceFood[] = TACO_REFERENCES,
  measuresById: Map<string, FoodPortion> = new Map(),
  substitutions: MealPlanSubstitutionPayload[] = []
): MealPlanChangeApplyResult {
  const working: MealPlanMealPayload[] = meals.map((meal) => ({ ...meal, items: meal.items.map((item) => ({ ...item })) }));
  let workingSubstitutions: MealPlanSubstitutionPayload[] = substitutions.map((item) => ({ ...item }));
  const summaries: MealPlanChangePreview["changeSummaries"] = [];
  let totalImpact: MacroDelta = ZERO_DELTA;
  // FASE 3 (precisao nutricional): registra a resolucao de quantidade de
  // toda ponta "depois" tocada por uma mudanca — se qualquer uma nao for
  // confidence="high", o preview inteiro avisa que ha estimativa envolvida
  // (nunca afirma precisao que o motor central nao confirmou).
  const resolutions: QuantityResolution[] = [];

  function applyDelta(before: MacroDelta, after: MacroDelta, afterResolution?: QuantityResolution) {
    totalImpact = addDelta(totalImpact, before, after);
    if (afterResolution) resolutions.push(afterResolution);
  }

  /** Resolve e valida a medida caseira de um `food` referenciado numa mudanca — lanca se a medida nao pertencer a esse alimento exato. */
  function resolveMeasureForChange(food: MealPlanFoodReference, householdMeasureId: string | null | undefined): FoodPortion | null {
    if (!householdMeasureId) return null;
    const portion = measuresById.get(householdMeasureId);
    if (!portion || portion.food_source !== food.source || portion.food_ref_id !== food.refId) {
      throw new MealPlanChangeValidationError(`A medida caseira informada não pertence ao alimento "${food.foodName}".`);
    }
    return portion;
  }

  for (const change of changes) {
    switch (change.operation) {
      case "add_meal": {
        working.push({ name: change.name, suggested_time: change.suggestedTime ?? null, notes: change.notes ?? null, items: [] });
        summaries.push({ operation: change.operation, mealName: change.name, before: null, after: "(refeição nova, sem itens)" });
        break;
      }
      case "remove_meal": {
        const meal = findMeal(working, change.mealId);
        const before = meal.items.map((item) => describeItem(item.food, item.quantity, item.unit)).join("; ") || "(sem itens)";
        for (const item of meal.items) {
          applyDelta(existingItemMacros(item, references, measuresById).macros, ZERO_DELTA);
        }
        summaries.push({ operation: change.operation, mealName: meal.name, before, after: null });
        working.splice(working.indexOf(meal), 1);
        break;
      }
      case "rename_meal": {
        const meal = findMeal(working, change.mealId);
        summaries.push({ operation: change.operation, mealName: meal.name, before: meal.name, after: change.name });
        meal.name = change.name;
        break;
      }
      case "change_meal_time": {
        const meal = findMeal(working, change.mealId);
        summaries.push({
          operation: change.operation,
          mealName: meal.name,
          before: meal.suggested_time ?? "(sem horário)",
          after: change.suggestedTime ?? "(sem horário)",
        });
        meal.suggested_time = change.suggestedTime ?? null;
        break;
      }
      case "duplicate_meal": {
        const meal = findMeal(working, change.mealId);
        const index = working.indexOf(meal);
        const copy: MealPlanMealPayload = {
          name: change.newName?.trim() || `${meal.name} (cópia)`,
          suggested_time: meal.suggested_time ?? null,
          notes: meal.notes ?? null,
          items: meal.items.map((item) => ({ ...item, id: undefined })),
        };
        working.splice(index + 1, 0, copy);
        for (const item of copy.items) {
          applyDelta(ZERO_DELTA, existingItemMacros(item, references, measuresById).macros);
        }
        summaries.push({
          operation: change.operation,
          mealName: copy.name,
          before: null,
          after: `(cópia de "${meal.name}", ${copy.items.length} item${copy.items.length === 1 ? "" : "ns"})`,
        });
        break;
      }
      case "reorder_meals": {
        if (working.some((meal) => !meal.id)) {
          throw new MealPlanChangeValidationError(
            "Não é possível reordenar refeições na mesma proposta em que uma refeição nova foi adicionada/duplicada — confirme essa mudança primeiro, depois proponha a reordenação."
          );
        }
        const currentIds = working.map((meal) => meal.id as string);
        const currentSet = new Set(currentIds);
        const requestedSet = new Set(change.mealIds);
        if (currentSet.size !== requestedSet.size || currentIds.some((id) => !requestedSet.has(id))) {
          throw new MealPlanChangeValidationError(
            "A nova ordem de refeições precisa incluir exatamente as refeições atuais do plano, sem adicionar ou remover nenhuma."
          );
        }
        const byId = new Map(working.map((meal) => [meal.id as string, meal] as const));
        const before = currentIds.map((id) => byId.get(id)?.name).join(" → ");
        working.length = 0;
        working.push(...change.mealIds.map((id) => byId.get(id)!));
        summaries.push({ operation: change.operation, mealName: mealPlanTitle, before, after: change.mealIds.map((id) => byId.get(id)?.name).join(" → ") });
        break;
      }
      case "add_item": {
        const meal = findMeal(working, change.mealId);
        const portion = resolveMeasureForChange(change.food, change.householdMeasureId);
        const householdMeasure = portion ? toHouseholdMeasureOption(portion) : null;
        const after = describeItem(change.food.foodName, String(change.quantity), portion ? portion.description : change.unit);
        const result = resolveFoodMacros(change.food, change.quantity, change.unit, references, householdMeasure);
        applyDelta(ZERO_DELTA, result.macros, result.quantity);
        summaries.push({ operation: change.operation, mealName: meal.name, before: null, after });
        meal.items.push({
          food: change.food.foodName,
          quantity: String(change.quantity),
          unit: change.unit,
          notes: change.notes ?? null,
          food_source: change.food.source,
          food_ref_id: change.food.refId,
          household_measure_id: portion ? portion.id : null,
        });
        break;
      }
      case "remove_item": {
        const meal = findMeal(working, change.mealId);
        const index = findItemIndex(meal, change.itemId);
        const item = meal.items[index];
        applyDelta(existingItemMacros(item, references, measuresById).macros, ZERO_DELTA);
        summaries.push({ operation: change.operation, mealName: meal.name, before: describeItem(item.food, item.quantity, item.unit), after: null });
        meal.items.splice(index, 1);
        break;
      }
      case "replace_item": {
        const meal = findMeal(working, change.mealId);
        const index = findItemIndex(meal, change.itemId);
        const oldItem = meal.items[index];
        const portion = resolveMeasureForChange(change.food, change.householdMeasureId);
        const householdMeasure = portion ? toHouseholdMeasureOption(portion) : null;
        const result = resolveFoodMacros(change.food, change.quantity, change.unit, references, householdMeasure);
        applyDelta(existingItemMacros(oldItem, references, measuresById).macros, result.macros, result.quantity);
        summaries.push({
          operation: change.operation,
          mealName: meal.name,
          before: describeItem(oldItem.food, oldItem.quantity, oldItem.unit),
          after: describeItem(change.food.foodName, String(change.quantity), portion ? portion.description : change.unit),
        });
        meal.items[index] = {
          food: change.food.foodName,
          quantity: String(change.quantity),
          unit: change.unit,
          notes: change.notes ?? oldItem.notes ?? null,
          food_source: change.food.source,
          food_ref_id: change.food.refId,
          household_measure_id: portion ? portion.id : null,
        };
        break;
      }
      case "change_quantity": {
        const meal = findMeal(working, change.mealId);
        const index = findItemIndex(meal, change.itemId);
        const item = meal.items[index];
        const householdMeasure = householdMeasureFor(item, measuresById);
        const result = resolveFoodItemMacros(
          { food: item.food, quantity: change.quantity, unit: item.unit, food_source: item.food_source, food_ref_id: item.food_ref_id },
          references,
          householdMeasure
        );
        applyDelta(existingItemMacros(item, references, measuresById).macros, result.macros, result.quantity);
        summaries.push({
          operation: change.operation,
          mealName: meal.name,
          before: describeItem(item.food, item.quantity, item.unit),
          after: describeItem(item.food, String(change.quantity), item.unit),
        });
        item.quantity = String(change.quantity);
        break;
      }
      case "change_measure": {
        const meal = findMeal(working, change.mealId);
        const index = findItemIndex(meal, change.itemId);
        const item = meal.items[index];
        const result = resolveFoodItemMacros(
          { food: item.food, quantity: item.quantity, unit: change.unit, food_source: item.food_source, food_ref_id: item.food_ref_id },
          references
        );
        applyDelta(existingItemMacros(item, references, measuresById).macros, result.macros, result.quantity);
        summaries.push({
          operation: change.operation,
          mealName: meal.name,
          before: describeItem(item.food, item.quantity, item.unit),
          after: describeItem(item.food, item.quantity, change.unit),
        });
        // change_measure so troca a unidade generica (colher/xicara/etc) —
        // nunca vincula automaticamente a um household_measure_id real, que
        // exige uma medida especifica CADASTRADA para este alimento; para
        // vincular uma medida especifica, use add_item/replace_item com
        // householdMeasureId (FASE 4).
        item.unit = change.unit;
        item.household_measure_id = null;
        break;
      }
      case "duplicate_item": {
        const meal = findMeal(working, change.mealId);
        const index = findItemIndex(meal, change.itemId);
        const original = meal.items[index];
        const copy: MealPlanItemPayload = { ...original, id: undefined };
        meal.items.splice(index + 1, 0, copy);
        applyDelta(ZERO_DELTA, existingItemMacros(copy, references, measuresById).macros);
        summaries.push({ operation: change.operation, mealName: meal.name, before: null, after: describeItem(copy.food, copy.quantity, copy.unit) });
        break;
      }
      case "reorder_items": {
        const meal = findMeal(working, change.mealId);
        if (meal.items.some((item) => !item.id)) {
          throw new MealPlanChangeValidationError(
            `Não é possível reordenar itens da refeição "${meal.name}" na mesma proposta em que um item novo foi adicionado/duplicado — confirme essa mudança primeiro, depois proponha a reordenação.`
          );
        }
        const currentIds = meal.items.map((item) => item.id as string);
        const currentSet = new Set(currentIds);
        const requestedSet = new Set(change.itemIds);
        if (currentSet.size !== requestedSet.size || currentIds.some((id) => !requestedSet.has(id))) {
          throw new MealPlanChangeValidationError(
            `A nova ordem de itens da refeição "${meal.name}" precisa incluir exatamente os itens atuais dela, sem adicionar ou remover nenhum.`
          );
        }
        const byId = new Map(meal.items.map((item) => [item.id as string, item] as const));
        const before = currentIds.map((id) => byId.get(id)?.food).join(" → ");
        meal.items = change.itemIds.map((id) => byId.get(id)!);
        summaries.push({ operation: change.operation, mealName: meal.name, before, after: change.itemIds.map((id) => byId.get(id)?.food).join(" → ") });
        break;
      }
      case "add_substitution": {
        // A quantidade NUNCA vem do modelo — só a identidade do candidato
        // (já resolvida via searchMealPlanFoods, mesma garantia de add_item
        // acima). Tudo abaixo é calculado aqui, deterministicamente, pela
        // MESMA substitution engine usada pelo editor manual — nunca uma
        // segunda lógica de cálculo para o caminho de IA.
        const meal = findMeal(working, change.mealId);
        const index = findItemIndex(meal, change.itemId);
        const item = meal.items[index];
        if (!item.food_source || !item.food_ref_id) {
          throw new MealPlanChangeValidationError(`"${item.food}" não tem um alimento vinculado ao catálogo — não é possível calcular uma substituição equivalente para ele.`);
        }
        // FASE 6.5 (item 13) — substituições via IA continuam SÓ pro catálogo
        // legado (TACO/CUSTOM/MANUFACTURER/USDA); um item com identidade TBCA/
        // IBGE_POF (transportada pelo piloto de busca administrativa) ainda
        // não pode virar substituição por este caminho — nunca "ativar
        // canonical em meal_plan_ai" nesta fase.
        if (item.food_source === "TBCA" || item.food_source === "IBGE_POF") {
          throw new MealPlanChangeValidationError(`"${item.food}" ainda não suporta substituição automática por este assistente — edite manualmente pelo editor de plano.`);
        }
        const baseFood = findFoodReferenceByIdentity(references, item.food_source, item.food_ref_id);
        const candidateFood = findFoodReferenceByIdentity(references, change.optionFood.source, change.optionFood.refId);
        if (!baseFood || !candidateFood) {
          throw new MealPlanChangeValidationError("Não foi possível revalidar um dos alimentos desta substituição contra o catálogo atual.");
        }
        // FASE 8.5 (item 10) — a IA pode ajudar a interpretar o pedido da
        // nutricionista ("quero algo mais barato"), mas NUNCA pode ignorar o
        // grupo do slot de origem do item: valida aqui, deterministicamente,
        // com o MESMO classificador da Fase 7 — nunca confia no julgamento
        // do modelo sobre o que é "compatível".
        if (item.slot_food_group) {
          const candidateGroup = classifyFoodExchangeGroup(candidateFood).foodGroup;
          if (candidateGroup !== item.slot_food_group) {
            throw new MealPlanChangeValidationError(
              `"${change.optionFood.foodName}" não pertence ao grupo alimentar esperado para esta posição (${item.slot_food_group}) — proponha uma alternativa dentro do mesmo grupo, ou peça pra nutricionista trocar o slot manualmente.`
            );
          }
        }
        const baseGrams = existingItemMacros(item, references, measuresById).quantity.grams ?? 0;
        if (baseGrams <= 0) {
          throw new MealPlanChangeValidationError(`Não foi possível determinar a quantidade atual de "${item.food}" para calcular uma substituição equivalente.`);
        }
        const [result] = findFoodSubstitutes({ baseFood, baseGrams, candidates: [candidateFood], mode: change.mode ?? "nutritional" });
        if (!result) {
          throw new MealPlanChangeValidationError(`"${change.optionFood.foodName}" não é uma equivalência plausível para "${item.food}" dentro das tolerâncias técnicas.`);
        }
        const already = workingSubstitutions.some((sub) =>
          sub.base_food_source === item.food_source && sub.base_food_ref_id === item.food_ref_id &&
          sub.option_food_source === change.optionFood.source && sub.option_food_ref_id === change.optionFood.refId
        );
        if (already) {
          throw new MealPlanChangeValidationError(`"${change.optionFood.foodName}" já está entre as substituições de "${item.food}".`);
        }
        workingSubstitutions = [...workingSubstitutions, {
          base_food: item.food,
          option_food: toDisplayFoodName(result.food.descricao),
          quantity: String(result.quantityGrams),
          unit: "g",
          base_food_source: item.food_source,
          base_food_ref_id: item.food_ref_id,
          option_food_source: change.optionFood.source,
          option_food_ref_id: change.optionFood.refId,
          option_nutrition_snapshot: JSON.stringify(result.nutrition),
          equivalence_mode: result.mode,
          equivalence_score: result.score,
          equivalence_quality: result.quality,
          // Sugestão vinda do Assistente entra como pendente — a nutricionista
          // ainda precisa aprovar (approve_substitution) antes dela valer pra
          // impressão/portal, mesmo já tendo passado por confirmação de proposta.
          approved_by_professional: false,
          ai_suggested: true,
        }];
        summaries.push({
          operation: change.operation,
          mealName: meal.name,
          before: null,
          after: `${item.food} → ${toDisplayFoodName(result.food.descricao)} (${result.quantityGrams} g, pendente de aprovação)`,
        });
        break;
      }
      case "remove_substitution": {
        const meal = findMeal(working, change.mealId);
        const index = findItemIndex(meal, change.itemId);
        const item = meal.items[index];
        const before = workingSubstitutions.length;
        workingSubstitutions = workingSubstitutions.filter((sub) =>
          !(sub.base_food_source === item.food_source && sub.base_food_ref_id === item.food_ref_id &&
            sub.option_food_source === change.optionFoodSource && sub.option_food_ref_id === change.optionFoodRefId)
        );
        if (workingSubstitutions.length === before) {
          throw new MealPlanChangeValidationError(`Não encontrei essa substituição de "${item.food}" para remover.`);
        }
        summaries.push({ operation: change.operation, mealName: meal.name, before: item.food, after: null });
        break;
      }
      case "approve_substitution": {
        const meal = findMeal(working, change.mealId);
        const index = findItemIndex(meal, change.itemId);
        const item = meal.items[index];
        let found = false;
        workingSubstitutions = workingSubstitutions.map((sub) => {
          if (sub.base_food_source === item.food_source && sub.base_food_ref_id === item.food_ref_id &&
              sub.option_food_source === change.optionFoodSource && sub.option_food_ref_id === change.optionFoodRefId) {
            found = true;
            return { ...sub, approved_by_professional: true };
          }
          return sub;
        });
        if (!found) {
          throw new MealPlanChangeValidationError(`Não encontrei essa substituição de "${item.food}" para aprovar.`);
        }
        summaries.push({ operation: change.operation, mealName: meal.name, before: "pendente", after: "aprovada" });
        break;
      }
    }
  }

  const rounded = roundedMacros({ ...totalImpact, recognizedItems: 0, totalItems: 0 });
  const hasEstimatedValues = resolutions.some((resolution) => resolution.confidence !== "high");

  // totalVsTarget (FASE 2): so calcula quando o plano tem alguma meta
  // definida — nunca IA, so o motor determinístico (nutrients.ts/targets.ts).
  let totalVsTarget: MealPlanChangePreview["totalVsTarget"];
  if (target && Object.values(target).some((value) => value !== null && value !== undefined)) {
    const { total } = calculatePlanNutrients({ meals: working }, buildFoodReferenceLookup(references, measuresById));
    totalVsTarget = compareTargetVsPrescribed(target, total.values).map((row) => ({
      nutrient: row.nutrient as "energyKcal" | "proteinG" | "carbohydrateG" | "fatG",
      target: row.target,
      prescribedAfter: row.prescribed,
      diff: row.diff,
      percentOfTarget: row.percentOfTarget,
    }));
  }

  return {
    meals: working,
    substitutions: workingSubstitutions,
    preview: {
      mealPlanTitle,
      changeSummaries: summaries,
      totalImpact: { kcal: rounded.kcal, protein: rounded.protein, carbs: rounded.carbs, fat: rounded.fat },
      ...(totalVsTarget ? { totalVsTarget } : {}),
      ...(hasEstimatedValues ? { hasEstimatedValues: true } : {}),
    },
  };
}

export async function executeProposeMealPlanChange(input: ProposeMealPlanChangeInput): Promise<ProposeMealPlanChangeOutput> {
  const plan = await getMealPlanById(input.mealPlanId);
  if (!plan) return { error: "Plano alimentar não encontrado. Peça para eu reler os planos do cliente." };

  // Concorrencia otimista checada JA na criacao da proposta (e novamente, de
  // forma obrigatoria, na confirmacao) — se o plano mudou desde que o modelo
  // leu o contexto, nao monta proposta nenhuma em cima de dado desatualizado.
  if (plan.version !== input.baseVersion) {
    return { error: "O plano foi alterado desde a última leitura. Peça para eu reler o plano atual antes de propor mudanças." };
  }

  const { references, measuresById } = await resolveMealPlanChangeReferences(plan, input.changes);
  const referenceError = validateMealPlanFoodReferences(input.changes, references);
  if (referenceError) return { error: referenceError };

  try {
    const target: NutrientTarget = {
      energyKcal: plan.target_energy_kcal ?? null,
      proteinG: plan.target_protein_g ?? null,
      carbohydrateG: plan.target_carbohydrate_g ?? null,
      fatG: plan.target_fat_g ?? null,
    };
    const { preview } = applyMealPlanChangesWithPreview(plan.meals, input.changes, plan.title, target, references, measuresById, plan.substitutions);
    return { clientId: plan.client_id, mealPlanId: plan.id, baseVersion: plan.version, changes: input.changes, preview };
  } catch (error) {
    return { error: error instanceof MealPlanChangeValidationError ? error.message : "Não foi possível montar essa alteração a partir do plano atual." };
  }
}

// ── get_meal_plan_nutrition (READ) ───────────────────────────────────────

export const GET_MEAL_PLAN_NUTRITION_TOOL_NAME = "getMealPlanNutrition";
export const getMealPlanNutritionInputSchema = z.object({ mealPlanId: z.string().min(1) }).strict();
export type GetMealPlanNutritionInput = z.infer<typeof getMealPlanNutritionInputSchema>;

/**
 * Motor determinístico (nutrients.ts/targets.ts) exposto como tool de
 * leitura — nunca a IA calculando nutriente de cabeça (seçao 2/32/39 do
 * pedido). Devolve so os numeros ja calculados, pequenos e prontos.
 *
 * FASE 4B: usa a MESMA engine e o MESMO catalogo multi-fonte (TACO/CUSTOM/
 * MANUFACTURER) que `applyMealPlanChangesWithPreview` — um alimento
 * CUSTOM/MANUFACTURER adicionado via meal_plan_change agora entra no total
 * calculado aqui, nunca fica de fora silenciosamente.
 */
export async function executeGetMealPlanNutrition(input: GetMealPlanNutritionInput) {
  assertCategoryAllowed("meal_plan_review", "meal_plan");
  const plan = await getMealPlanById(input.mealPlanId);
  if (!plan) return { found: false as const };

  const { references, measuresById } = await resolveMealPlanChangeReferences(plan);
  const { total, perMeal } = calculatePlanNutrients(plan, buildFoodReferenceLookup(references, measuresById));
  const target: NutrientTarget = {
    energyKcal: plan.target_energy_kcal ?? null,
    proteinG: plan.target_protein_g ?? null,
    carbohydrateG: plan.target_carbohydrate_g ?? null,
    fatG: plan.target_fat_g ?? null,
  };
  const rounded = roundedNutrients(total.values);

  return {
    found: true as const,
    mealPlanId: plan.id,
    perMeal: perMeal.map((meal) => {
      const values = roundedNutrients(meal.values);
      return { name: meal.name, kcal: values.energyKcal, protein: values.proteinG, carbs: values.carbohydrateG, fat: values.fatG };
    }),
    totalDay: { kcal: rounded.energyKcal, protein: rounded.proteinG, carbs: rounded.carbohydrateG, fat: rounded.fatG, fiber: rounded.fiberG, sodium: rounded.sodiumMg },
    comparisonVsTarget: compareTargetVsPrescribed(target, total.values),
    coverage: total.coverage.energyKcal,
  };
}

// ── find_food_equivalents (READ) ─────────────────────────────────────────

export const FIND_FOOD_EQUIVALENTS_TOOL_NAME = "findFoodEquivalents";
export const findFoodEquivalentsInputSchema = z.object({
  food: z.string().min(1).max(200),
  amountGrams: z.number().positive().max(5000),
  targetNutrient: z.enum(["energyKcal", "proteinG", "carbohydrateG", "fatG"]),
  tolerancePercent: z.number().positive().max(50).optional(),
  sameCategoryOnly: z.boolean().optional(),
}).strict();
export type FindFoodEquivalentsInput = z.infer<typeof findFoodEquivalentsInputSchema>;

/** Wrapper de leitura sobre lib/nutrition/equivalence.ts — 100% determinístico, nunca a IA escolhendo a equivalencia (seçao 22 do pedido). */
export async function executeFindFoodEquivalents(input: FindFoodEquivalentsInput) {
  assertCategoryAllowed("meal_plan_review", "meal_plan");
  const baseFood = findBestTacoFood(input.food);
  if (!baseFood) return { found: false as const };

  const results = findEquivalentFoodsEngine({
    baseFood,
    amountGrams: input.amountGrams,
    targetNutrient: input.targetNutrient,
    candidates: TACO_REFERENCES,
    tolerancePercent: input.tolerancePercent,
    sameCategoryOnly: input.sameCategoryOnly,
  });

  return {
    found: true as const,
    baseFood: { tacoNumber: baseFood.numero, descricao: baseFood.descricao },
    equivalents: results.map((result) => ({
      tacoNumber: result.food.numero,
      descricao: result.food.descricao,
      grams: result.gramsNeeded,
      deltaPercent: result.deltaPercent,
      sameCategory: result.sameCategory,
    })),
  };
}

// ── get_client_meal_plans (READ, FASE 6) ─────────────────────────────────
//
// Lista TODOS os planos do cliente (draft/active/archived) — diferente de
// getPatientActivePlan (so o ativo). Necessario para o fluxo de ativacao:
// o modelo precisa descobrir o id/versao de um plano DRAFT antes de propor
// ativa-lo, ja que ele nunca aparece como "plano ativo" no contexto.

export const GET_CLIENT_MEAL_PLANS_TOOL_NAME = "getClientMealPlans";
export const getClientMealPlansInputSchema = z.object({ clientId: z.string().min(1).max(120) }).strict();
export type GetClientMealPlansInput = z.infer<typeof getClientMealPlansInputSchema>;

export async function executeGetClientMealPlans(input: GetClientMealPlansInput) {
  const plans = await getClientMealPlans(input.clientId);
  return {
    plans: plans.map((plan) => ({
      mealPlanId: plan.id,
      title: plan.title,
      status: plan.status,
      version: plan.version,
    })),
  };
}

// ── propose_activate_meal_plan (clinical write, FASE 6) ─────────────────
//
// Distinto de meal_plan_change (edicao de conteudo): so muda `status`
// draft -> active, reusando updateMealPlan/optimistic concurrency/
// versionamento identicos (nenhum caminho paralelo). O plano precisa
// existir e NAO estar ja ativo — revalidado de novo no confirm.

export const PROPOSE_ACTIVATE_MEAL_PLAN_TOOL_NAME = "proposeActivateMealPlan";
export const proposeActivateMealPlanInputSchema = z.object({
  mealPlanId: z.string().min(1),
  baseVersion: z.number().int().positive(),
}).strict();
export type ProposeActivateMealPlanInput = z.infer<typeof proposeActivateMealPlanInputSchema>;

export type ProposeActivateMealPlanOutput =
  | { error: string }
  | { clientId: string; mealPlanId: string; baseVersion: number; mealPlanTitle: string };

export async function executeProposeActivateMealPlan(input: ProposeActivateMealPlanInput): Promise<ProposeActivateMealPlanOutput> {
  const plan = await getMealPlanById(input.mealPlanId);
  if (!plan) return { error: "Plano alimentar não encontrado. Peça para eu reler os planos do cliente." };
  if (plan.version !== input.baseVersion) {
    return { error: "O plano foi alterado desde a última leitura. Peça para eu reler o plano atual antes de propor a ativação." };
  }
  if (plan.status === "active") return { error: "Esse plano já está ativo." };
  return { clientId: plan.client_id, mealPlanId: plan.id, baseVersion: plan.version, mealPlanTitle: plan.title };
}

export const MEAL_PLAN_ACTIVATION_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode propor a ATIVACAO de um plano alimentar (torna-lo o plano vigente do cliente, arquivando o que estava ativo antes) — isto e distinto de editar o conteudo do plano, e e uma acao clinica mais sensivel.
Como fazer isso:
- Se voce nao sabe o id/versao do plano que a nutricionista quer ativar (ex.: um plano rascunho recem-criado), use ${GET_CLIENT_MEAL_PLANS_TOOL_NAME} primeiro para listar os planos do cliente e identificar o correto pelo titulo/status.
- So proponha ativacao quando o pedido for explicito ("ativa esse plano", "publica esse plano", "faz esse virar o plano oficial dela") — nunca ative um plano automaticamente so por ele ter acabado de ser criado ou editado.
- Use ${PROPOSE_ACTIVATE_MEAL_PLAN_TOOL_NAME} informando mealPlanId e baseVersion exatamente como veio da leitura mais recente.
- Se a ferramenta devolver "error" (plano nao encontrado, versao desatualizada, ja ativo), explique o problema em texto simples e nao insista.
- Esta e sempre uma PROPOSTA — mostre o titulo do plano e avise que o plano ativo atual (se houver) sera arquivado, antes de pedir confirmacao.
`.trim();

export const MEAL_PLAN_CHANGE_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode propor alteracoes estruturadas no plano alimentar ativo do cliente atual — isto e uma proposta clinica real, nunca mais texto solto dentro do prontuario. Cobre: adicionar/renomear/duplicar/remover refeicao, mudar horario de refeicao, reordenar refeicoes, adicionar/substituir/remover/duplicar um alimento, mudar quantidade/medida de um item, reordenar itens de uma refeicao.
Como fazer isso:
- O plano ativo (com o id de cada refeicao/item e a versao atual) ja esta no contexto acima. Use esses ids EXATAMENTE como aparecem — nunca invente um id.
- Para adicionar ou substituir um alimento (operacoes add_item/replace_item), SEMPRE resolva o alimento com ${"searchFoods"} primeiro e use o source/refId reais de um resultado — nunca informe um alimento que nao veio de uma busca, e nunca deixe de resolver so porque o nome parece obvio.
- Se a busca por alimento voltar ambigua (varios resultados bem diferentes entre si, ex.: "frango" podendo ser peito/coxa/com ou sem pele), pergunte qual antes de propor — nunca escolha sozinha.
- Para uma quantidade em medida caseira (ex.: "1 banana média", "2 colheres de arroz"), use ${"getFoodPortions"} para ver se ha uma medida especifica CADASTRADA para aquele alimento e informe o householdMeasureId dela. Se nao houver medida cadastrada, NUNCA invente um peso — pergunte a quantidade em gramas, ou use a unidade generica mais proxima deixando claro que e uma estimativa.
- Para duplicar uma refeicao ou item, use duplicate_meal/duplicate_item — a copia entra logo depois do original.
- Para reordenar refeicoes ou itens de uma refeicao, use reorder_meals/reorder_items informando a lista COMPLETA de ids na ordem final desejada (todos os ids atuais, sem adicionar nem remover nenhum) — nunca um indice solto tipo "mova a posicao 2 pra 4". Nao reordene na MESMA proposta em que voce acabou de adicionar/duplicar algo (o item novo ainda nao tem id) — primeiro confirme a adicao, depois proponha a reordenacao.
- Para "analise o plano" ou perguntas sobre kcal/proteina/carboidrato/gordura/meta do dia, use ${GET_MEAL_PLAN_NUTRITION_TOOL_NAME} — ele ja calcula tudo (total por refeicao, total do dia, comparacao com a meta). NUNCA some ou estime esses numeros voce mesma; sempre use a ferramenta.
- Para sugerir uma troca por nutriente ("uma fruta com menos carboidrato", "algo com mais proteina no lugar disso"), use ${FIND_FOOD_EQUIVALENTS_TOOL_NAME} primeiro para ver alternativas reais, resolva o alimento escolhido com ${"searchFoods"} e so entao proponha a troca com ${PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME} — nunca invente uma alternativa de cabeca.
- SUBSTITUIÇÕES (diferente de trocar o item prescrito): quando a pessoa pedir "alternativas para X" sem querer substituir o item de verdade (ex.: "me dê opções pra substituir o arroz do almoço", "posso trocar esse frango por peixe?"), isso NÃO é uma alteração — é uma consulta. Use ${FIND_FOOD_EQUIVALENTS_TOOL_NAME} pra achar candidatos reais e responda em texto (ex.: "Encontrei estas opções calculadas pelo sistema: Batata inglesa cozida — 180 g, Mandioca cozida — 85 g. Quer adicionar alguma como opção de substituição?"). Só quando a pessoa CONFIRMAR qual quer adicionar (ex.: "adiciona batata e mandioca"), resolva cada candidato com ${"searchFoods"} e proponha operation:"add_substitution" (mealId, itemId do alimento PRESCRITO, optionFood resolvido) — a quantidade NUNCA vem de você, o sistema calcula e revalida sozinho depois de confirmado; a substituição entra como PENDENTE (approved_by_professional=false) até a nutricionista aprovar explicitamente com operation:"approve_substitution", e "remove_substitution" tira uma existente (aprovada ou pendente). Substituições são ALTERNATIVAS — nunca somadas ao total de kcal/macros do plano, nunca fale como se fossem consumidas junto com o item original.
- So chame ${PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME} quando o pedido for uma alteracao concreta e clara ("adiciona 100g de banana no cafe da manha", "troca a banana por maca", "tira esse suplemento", "aumenta o arroz para 150g", "duplica o cafe da manha" — isso pode virar varias operacoes na mesma chamada). Informe mealPlanId e baseVersion exatamente como estao no contexto.
- Se o pedido for so analise ("o que acha desse plano", "da pra melhorar algo aqui"), NAO chame a ferramenta de alteracao — responda em texto, separando DADOS DO SISTEMA (vindos de ${GET_MEAL_PLAN_NUTRITION_TOOL_NAME}) de SUGESTAO, e so proponha de verdade se a pessoa concordar com uma mudanca especifica.
- Se o pedido for pedir opcoes ("me da alternativas para esse lanche"), responda em texto com as opcoes — so chame a ferramenta de alteracao quando a pessoa escolher uma delas.
- Se houver ambiguidade sobre qual item ou refeicao a pessoa quer mudar (ex.: duas refeicoes com item parecido), pergunte qual antes de propor — nunca escolha sozinha.
- Se a ferramenta devolver "error" (ex.: plano mudou desde a ultima leitura, alimento invalido, medida caseira nao pertence ao alimento), explique o problema em texto simples e nao insista automaticamente.
- NUNCA diga em texto que vai chamar uma ferramenta ("vou montar a proposta", "vou adicionar isso") sem chamar-la de verdade na MESMA resposta — ou você chama a ferramenta agora, ou você faz a pergunta que falta antes de poder chamar; nunca um texto prometendo uma ação futura sem a tool call correspondente.
`.trim();
