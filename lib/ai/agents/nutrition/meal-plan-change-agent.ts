import { z } from "zod";
import { getMealPlanById, type MealPlanMealPayload, type MealPlanItemPayload } from "@/lib/repositories/meal-plans";
import { searchTacoFoods, getTacoFoodByNumber, estimateFoodMacrosFromTaco } from "@/lib/nutrition/taco";
import { estimateFoodMacros, roundedMacros, type MacroReferenceFood } from "@/lib/nutrition/macros";
import {
  mealPlanChangeOperationSchema,
  type MealPlanChangeOperation,
  type MealPlanFoodReference,
  type MealPlanMeasureUnit,
  type MealPlanChangePreview,
} from "@/lib/ai/schemas/action.schema";

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

function macrosFromTacoReference(reference: MacroReferenceFood, quantity: number, unit: MealPlanMeasureUnit) {
  // Usa a descricao REAL do registro (nao o texto digitado) como "food" para
  // garantir match exato dentro de estimateFoodMacros — nunca reimplementa
  // o calculo de kcal/proteina/carboidrato/gordura que ja existe ali.
  return estimateFoodMacros(reference.descricao, quantity, unit, [reference]);
}

function resolveFoodMacros(food: MealPlanFoodReference, quantity: number, unit: MealPlanMeasureUnit) {
  if (food.tacoNumber !== null) {
    const reference = getTacoFoodByNumber(food.tacoNumber);
    if (reference) return macrosFromTacoReference(reference, quantity, unit);
  }
  return estimateFoodMacrosFromTaco(food.foodName, quantity, unit);
}

function existingItemMacros(item: MealPlanItemPayload) {
  return estimateFoodMacrosFromTaco(item.food, item.quantity, item.unit);
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
export function applyMealPlanChangesWithPreview(
  meals: MealPlanMealPayload[],
  changes: MealPlanChangeOperation[],
  mealPlanTitle: string
): MealPlanChangeApplyResult {
  const working: MealPlanMealPayload[] = meals.map((meal) => ({ ...meal, items: meal.items.map((item) => ({ ...item })) }));
  const summaries: MealPlanChangePreview["changeSummaries"] = [];
  let totalImpact: MacroDelta = ZERO_DELTA;

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
          totalImpact = addDelta(totalImpact, existingItemMacros(item), ZERO_DELTA);
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
        totalImpact = addDelta(totalImpact, ZERO_DELTA, resolveFoodMacros(change.food, change.quantity, change.unit));
        summaries.push({ operation: change.operation, mealName: meal.name, before: null, after });
        meal.items.push({ food: change.food.foodName, quantity: String(change.quantity), unit: change.unit, notes: change.notes ?? null });
        break;
      }
      case "remove_item": {
        const meal = findMeal(working, change.mealId);
        const index = findItemIndex(meal, change.itemId);
        const item = meal.items[index];
        totalImpact = addDelta(totalImpact, existingItemMacros(item), ZERO_DELTA);
        summaries.push({ operation: change.operation, mealName: meal.name, before: describeItem(item.food, item.quantity, item.unit), after: null });
        meal.items.splice(index, 1);
        break;
      }
      case "replace_item": {
        const meal = findMeal(working, change.mealId);
        const index = findItemIndex(meal, change.itemId);
        const oldItem = meal.items[index];
        totalImpact = addDelta(totalImpact, existingItemMacros(oldItem), resolveFoodMacros(change.food, change.quantity, change.unit));
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
        totalImpact = addDelta(totalImpact, existingItemMacros(item), estimateFoodMacrosFromTaco(item.food, change.quantity, item.unit));
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
        totalImpact = addDelta(totalImpact, existingItemMacros(item), estimateFoodMacrosFromTaco(item.food, item.quantity, change.unit));
        summaries.push({
          operation: change.operation,
          mealName: meal.name,
          before: describeItem(item.food, item.quantity, item.unit),
          after: describeItem(item.food, item.quantity, change.unit),
        });
        item.unit = change.unit;
        break;
      }
    }
  }

  const rounded = roundedMacros({ ...totalImpact, recognizedItems: 0, totalItems: 0 });
  return {
    meals: working,
    preview: {
      mealPlanTitle,
      changeSummaries: summaries,
      totalImpact: { kcal: rounded.kcal, protein: rounded.protein, carbs: rounded.carbs, fat: rounded.fat },
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
    const { preview } = applyMealPlanChangesWithPreview(plan.meals, input.changes, plan.title);
    return { clientId: plan.client_id, mealPlanId: plan.id, baseVersion: plan.version, changes: input.changes, preview };
  } catch (error) {
    return { error: error instanceof MealPlanChangeValidationError ? error.message : "Não foi possível montar essa alteração a partir do plano atual." };
  }
}

export const MEAL_PLAN_CHANGE_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode propor alteracoes estruturadas no plano alimentar ativo do cliente atual (trocar/adicionar/remover um alimento, mudar quantidade/medida/horario de uma refeicao, adicionar ou remover uma refeicao inteira) — isto e uma proposta clinica real, nunca mais texto solto dentro do prontuario.
Como fazer isso:
- O plano ativo (com o id de cada refeicao/item e a versao atual) ja esta no contexto acima. Use esses ids EXATAMENTE como aparecem — nunca invente um id.
- Se precisar do numero TACO de um alimento que nao sabe de cor, use ${SEARCH_MEAL_PLAN_FOODS_TOOL_NAME} primeiro e escolha entre os resultados reais — nunca informe um numero TACO que nao veio de uma busca.
- So chame ${PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME} quando o pedido for uma alteracao concreta e clara ("troca a banana por maca", "tira esse suplemento", "aumenta o arroz para 150g", "aplique a segunda opcao que sugeri"). Informe mealPlanId e baseVersion exatamente como estao no contexto.
- Se o pedido for so analise ("o que acha desse plano", "da pra melhorar algo aqui"), NAO chame a ferramenta — responda em texto, separando DADOS DO SISTEMA de SUGESTAO, e so proponha de verdade se a pessoa concordar com uma mudanca especifica.
- Se o pedido for pedir opcoes ("me da alternativas para esse lanche"), responda em texto com as opcoes — so chame a ferramenta quando a pessoa escolher uma delas.
- Se houver ambiguidade sobre qual item ou refeicao a pessoa quer mudar, pergunte qual antes de propor — nunca escolha sozinha.
- Se a ferramenta devolver "error" (ex.: plano mudou desde a ultima leitura, alimento invalido), explique o problema em texto simples e nao insista automaticamente.
`.trim();
