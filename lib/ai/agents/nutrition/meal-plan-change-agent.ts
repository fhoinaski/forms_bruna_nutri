import { z } from "zod";
import { getMealPlanById, type MealPlanMealPayload, type MealPlanItemPayload } from "@/lib/repositories/meal-plans";
import { searchTacoFoods, getTacoFoodByNumber, findBestTacoFood, TACO_REFERENCES } from "@/lib/nutrition/taco";
import { resolveFoodItemMacros, roundedMacros, type MacroReferenceFood } from "@/lib/nutrition/macros";
import type { QuantityResolution } from "@/lib/nutrition/quantity-resolution";
import { calculatePlanNutrients, roundedNutrients, type FoodReferenceLookup } from "@/lib/nutrition/nutrients";
import { compareTargetVsPrescribed, type NutrientTarget } from "@/lib/nutrition/targets";
import { findEquivalentFoods as findEquivalentFoodsEngine } from "@/lib/nutrition/equivalence";
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

/**
 * Usa a descricao REAL do registro (nao o texto digitado) como "food" para
 * garantir match exato dentro do motor central — nunca reimplementa o
 * calculo de kcal/proteina/carboidrato/gordura que ja existe ali
 * (lib/nutrition/macros.ts#resolveFoodItemMacros). A IA so trabalha com
 * unidades genericas hoje (MealPlanMeasureUnit fechado), entao nunca chega
 * a acionar o metodo "food_household_measure" — isso fica marcado
 * honestamente como estimativa no preview (quality.hasEstimatedValues
 * abaixo), em vez de fingir precisao que a tool nao tem hoje.
 */
function macrosFromTacoReference(reference: MacroReferenceFood, quantity: number, unit: MealPlanMeasureUnit) {
  return resolveFoodItemMacros({ food: reference.descricao, quantity, unit }, [reference]);
}

function resolveFoodMacros(food: MealPlanFoodReference, quantity: number, unit: MealPlanMeasureUnit) {
  if (food.tacoNumber !== null) {
    const reference = getTacoFoodByNumber(food.tacoNumber);
    if (reference) return macrosFromTacoReference(reference, quantity, unit);
  }
  return resolveFoodItemMacros({ food: food.foodName, quantity, unit }, TACO_REFERENCES);
}

function existingItemMacros(item: MealPlanItemPayload) {
  return resolveFoodItemMacros({ food: item.food, quantity: item.quantity, unit: item.unit, food_source: item.food_source, food_ref_id: item.food_ref_id }, TACO_REFERENCES);
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
  preview: MealPlanChangePreview;
}

/**
 * Aplica as operacoes estruturadas sobre uma copia em memoria do array de
 * refeicoes (nunca muta o array recebido) e, ao mesmo tempo, monta o preview
 * (resumo antes/depois por operacao + impacto total de macros). Lanca
 * MealPlanChangeValidationError se algum mealId/itemId referenciado nao
 * existir no snapshot recebido — isso so deveria acontecer se o modelo
 * inventou um id ou se o plano mudou entre a leitura e a proposta/confirmacao
 * (por isso o baseVersion e checado ANTES de chamar isto, tanto na criacao
 * da proposta quanto na confirmacao).
 */
// Lookup so-TACO (sem acesso a alimentos personalizados) — este modulo e
// puro/sincrono hoje; itens vinculados a alimentos personalizados
// simplesmente ficam de fora do totalVsTarget (cobertura reflete isso, nunca
// inventa o valor).
const TACO_ONLY_LOOKUP: FoodReferenceLookup = {
  byTacoNumber: (numero) => getTacoFoodByNumber(numero),
  byCustomId: () => null,
  fuzzyMatch: (food) => findBestTacoFood(food),
};

export function applyMealPlanChangesWithPreview(
  meals: MealPlanMealPayload[],
  changes: MealPlanChangeOperation[],
  mealPlanTitle: string,
  target?: NutrientTarget
): MealPlanChangeApplyResult {
  const working: MealPlanMealPayload[] = meals.map((meal) => ({ ...meal, items: meal.items.map((item) => ({ ...item })) }));
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
          applyDelta(existingItemMacros(item).macros, ZERO_DELTA);
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
      case "add_item": {
        const meal = findMeal(working, change.mealId);
        const after = describeItem(change.food.foodName, String(change.quantity), change.unit);
        const result = resolveFoodMacros(change.food, change.quantity, change.unit);
        applyDelta(ZERO_DELTA, result.macros, result.quantity);
        summaries.push({ operation: change.operation, mealName: meal.name, before: null, after });
        meal.items.push({ food: change.food.foodName, quantity: String(change.quantity), unit: change.unit, notes: change.notes ?? null });
        break;
      }
      case "remove_item": {
        const meal = findMeal(working, change.mealId);
        const index = findItemIndex(meal, change.itemId);
        const item = meal.items[index];
        applyDelta(existingItemMacros(item).macros, ZERO_DELTA);
        summaries.push({ operation: change.operation, mealName: meal.name, before: describeItem(item.food, item.quantity, item.unit), after: null });
        meal.items.splice(index, 1);
        break;
      }
      case "replace_item": {
        const meal = findMeal(working, change.mealId);
        const index = findItemIndex(meal, change.itemId);
        const oldItem = meal.items[index];
        const result = resolveFoodMacros(change.food, change.quantity, change.unit);
        applyDelta(existingItemMacros(oldItem).macros, result.macros, result.quantity);
        summaries.push({
          operation: change.operation,
          mealName: meal.name,
          before: describeItem(oldItem.food, oldItem.quantity, oldItem.unit),
          after: describeItem(change.food.foodName, String(change.quantity), change.unit),
        });
        meal.items[index] = {
          food: change.food.foodName,
          quantity: String(change.quantity),
          unit: change.unit,
          notes: change.notes ?? oldItem.notes ?? null,
        };
        break;
      }
      case "change_quantity": {
        const meal = findMeal(working, change.mealId);
        const index = findItemIndex(meal, change.itemId);
        const item = meal.items[index];
        const result = resolveFoodItemMacros({ food: item.food, quantity: change.quantity, unit: item.unit, food_source: item.food_source, food_ref_id: item.food_ref_id }, TACO_REFERENCES);
        applyDelta(existingItemMacros(item).macros, result.macros, result.quantity);
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
        const result = resolveFoodItemMacros({ food: item.food, quantity: item.quantity, unit: change.unit, food_source: item.food_source, food_ref_id: item.food_ref_id }, TACO_REFERENCES);
        applyDelta(existingItemMacros(item).macros, result.macros, result.quantity);
        summaries.push({
          operation: change.operation,
          mealName: meal.name,
          before: describeItem(item.food, item.quantity, item.unit),
          after: describeItem(item.food, item.quantity, change.unit),
        });
        // change_measure so troca a unidade generica (colher/xicara/etc) —
        // nunca vincula automaticamente a um household_measure_id real, que
        // exige uma medida especifica CADASTRADA para este alimento; a IA
        // hoje so conhece o vocabulario generico (MealPlanMeasureUnit).
        item.unit = change.unit;
        item.household_measure_id = null;
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
    const { total } = calculatePlanNutrients({ meals: working }, TACO_ONLY_LOOKUP);
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

  for (const change of input.changes) {
    if ("food" in change && change.food.tacoNumber !== null && !getTacoFoodByNumber(change.food.tacoNumber)) {
      return { error: `O alimento "${change.food.foodName}" não corresponde a um registro válido na base TACO.` };
    }
  }

  try {
    const target: NutrientTarget = {
      energyKcal: plan.target_energy_kcal ?? null,
      proteinG: plan.target_protein_g ?? null,
      carbohydrateG: plan.target_carbohydrate_g ?? null,
      fatG: plan.target_fat_g ?? null,
    };
    const { preview } = applyMealPlanChangesWithPreview(plan.meals, input.changes, plan.title, target);
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
 */
export async function executeGetMealPlanNutrition(input: GetMealPlanNutritionInput) {
  assertCategoryAllowed("meal_plan_review", "meal_plan");
  const plan = await getMealPlanById(input.mealPlanId);
  if (!plan) return { found: false as const };

  const { total, perMeal } = calculatePlanNutrients(plan, TACO_ONLY_LOOKUP);
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

export const MEAL_PLAN_CHANGE_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode propor alteracoes estruturadas no plano alimentar ativo do cliente atual (trocar/adicionar/remover um alimento, mudar quantidade/medida/horario de uma refeicao, adicionar ou remover uma refeicao inteira) — isto e uma proposta clinica real, nunca mais texto solto dentro do prontuario.
Como fazer isso:
- O plano ativo (com o id de cada refeicao/item e a versao atual) ja esta no contexto acima. Use esses ids EXATAMENTE como aparecem — nunca invente um id.
- Se precisar do numero TACO de um alimento que nao sabe de cor, use ${SEARCH_MEAL_PLAN_FOODS_TOOL_NAME} primeiro e escolha entre os resultados reais — nunca informe um numero TACO que nao veio de uma busca.
- Para "analise o plano" ou perguntas sobre kcal/proteina/carboidrato/gordura/meta do dia, use ${GET_MEAL_PLAN_NUTRITION_TOOL_NAME} — ele ja calcula tudo (total por refeicao, total do dia, comparacao com a meta). NUNCA some ou estime esses numeros voce mesma; sempre use a ferramenta.
- Para sugerir uma troca por nutriente ("uma fruta com menos carboidrato", "algo com mais proteina no lugar disso"), use ${FIND_FOOD_EQUIVALENTS_TOOL_NAME} primeiro para ver alternativas reais e so entao proponha a troca com ${PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME} usando um dos resultados retornados — nunca invente uma alternativa de cabeca.
- So chame ${PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME} quando o pedido for uma alteracao concreta e clara ("troca a banana por maca", "tira esse suplemento", "aumenta o arroz para 150g", "aplique a segunda opcao que sugeri", "aproxime o plano de 1900 kcal sem mexer no cafe da manha" — isso pode virar varias operacoes na mesma chamada). Informe mealPlanId e baseVersion exatamente como estao no contexto.
- Se o pedido for so analise ("o que acha desse plano", "da pra melhorar algo aqui"), NAO chame a ferramenta de alteracao — responda em texto, separando DADOS DO SISTEMA (vindos de ${GET_MEAL_PLAN_NUTRITION_TOOL_NAME}) de SUGESTAO, e so proponha de verdade se a pessoa concordar com uma mudanca especifica.
- Se o pedido for pedir opcoes ("me da alternativas para esse lanche"), responda em texto com as opcoes — so chame a ferramenta de alteracao quando a pessoa escolher uma delas.
- Se houver ambiguidade sobre qual item ou refeicao a pessoa quer mudar, pergunte qual antes de propor — nunca escolha sozinha.
- Se a ferramenta devolver "error" ou "found: false" (ex.: plano mudou desde a ultima leitura, alimento invalido, alimento nao encontrado na TACO), explique o problema em texto simples e nao insista automaticamente.
`.trim();
