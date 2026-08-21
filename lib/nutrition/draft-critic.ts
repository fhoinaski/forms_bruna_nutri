import type { DraftMeal } from "@/lib/nutrition/draft-types";
import { DEFAULT_HARD_MAX_GRAMS } from "@/lib/nutrition/draft-optimizer-v2";

/**
 * Crítica ESTRUTURAL do draft — deliberadamente uma função determinística
 * (não um segundo LLM): mais rápida, mais testável, e sem risco de
 * inventar diagnóstico clínico (seção 16 do pedido: "cuidado, não inventar
 * diagnóstico ou regra clínica universal"). Nunca altera o draft, só
 * aponta o que vale a pena a nutricionista revisar.
 */

export type CriticSeverity = "INFO" | "REVIEW" | "WARNING";
export type CriticScope = "PLAN" | "MEAL" | "ITEM";

export interface CriticFinding {
  severity: CriticSeverity;
  scope: CriticScope;
  mealName?: string;
  message: string;
}

const MAIN_MEAL_KEYS = new Set(["almoco", "jantar"]);

export function critiqueDraft(meals: DraftMeal[]): CriticFinding[] {
  const findings: CriticFinding[] = [];

  for (const meal of meals) {
    if (meal.needsReview.length > 0) {
      findings.push({
        severity: "WARNING",
        scope: "MEAL",
        mealName: meal.name,
        message: `${meal.needsReview.length} item(ns) de "${meal.name}" precisam de revisão (alimento não encontrado, ambíguo ou em conflito clínico) antes de aplicar.`,
      });
    }

    if (meal.items.length === 0 && meal.needsReview.length === 0) {
      findings.push({ severity: "WARNING", scope: "MEAL", mealName: meal.name, message: `"${meal.name}" ficou sem nenhum alimento.` });
      continue;
    }

    // Seção 28 do pedido de robustez do optimizer V2: quantidade perto do
    // teto técnico (nunca clínico — só proteção contra erro/absurdo) merece
    // revisão humana, tenha vindo do optimizer ou de edição manual. 90% do
    // hard max é só um critério de proximidade, documentado aqui.
    const nearHardMaxItems = meal.items.filter((item) => {
      const grams = Number(item.quantity.replace(",", "."));
      return Number.isFinite(grams) && grams >= DEFAULT_HARD_MAX_GRAMS * 0.9;
    });
    for (const item of nearHardMaxItems) {
      findings.push({
        severity: "REVIEW",
        scope: "ITEM",
        mealName: meal.name,
        message: `Quantidade elevada em "${item.displayName}" (${item.quantity} ${item.unit}) em "${meal.name}" — confira se está correto.`,
      });
    }

    const unsafeItems = meal.items.filter((item) => item.needsSafetyReview);
    if (unsafeItems.length > 0) {
      findings.push({
        severity: "REVIEW",
        scope: "MEAL",
        mealName: meal.name,
        message: `${unsafeItems.length} alimento(s) de "${meal.name}" com segurança clínica não confirmada — revisar antes de manter.`,
      });
    }

    if (meal.source_recipe_id && meal.items.length === 0) {
      findings.push({ severity: "WARNING", scope: "MEAL", mealName: meal.name, message: `Receita de "${meal.name}" não resultou em nenhum ingrediente calculável.` });
    }

    // Refeição principal com só 1 item — sinal objetivo de possível refeição
    // incompleta, nunca uma afirmação clínica ("baixo valor nutricional" etc.).
    if (MAIN_MEAL_KEYS.has(meal.mealKey) && meal.items.length === 1) {
      findings.push({ severity: "INFO", scope: "MEAL", mealName: meal.name, message: `"${meal.name}" tem só 1 alimento — confira se a refeição está completa.` });
    }
  }

  // Repetição do mesmo alimento (por identidade real, não por nome) em 3+
  // refeições — sinal objetivo de baixa variedade, nunca uma crítica de
  // "gosto" ou preferência.
  const foodOccurrences = new Map<string, { count: number; displayName: string }>();
  for (const meal of meals) {
    for (const item of meal.items) {
      const key = item.food_ref_id ? `${item.food_source}:${item.food_ref_id}` : `text:${item.food}`;
      const current = foodOccurrences.get(key);
      foodOccurrences.set(key, { count: (current?.count ?? 0) + 1, displayName: item.displayName });
    }
  }
  for (const { count, displayName } of foodOccurrences.values()) {
    if (count >= 3) {
      findings.push({ severity: "INFO", scope: "PLAN", message: `"${displayName}" aparece em ${count} refeições — pouca variedade.` });
    }
  }

  return findings;
}
