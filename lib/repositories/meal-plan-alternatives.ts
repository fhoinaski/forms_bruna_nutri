import type { MealPlanPayload, MealPlanSubstitutionPayload } from "@/lib/repositories/meal-plans";
import { listApprovedAlternativesForPlan } from "@/lib/repositories/exchange-groups";
import { getMealStructureItems } from "@/lib/meal-plans/flexible-structure";

export interface ApprovedMealPlanAlternative {
  source: "exchange_group" | "legacy_substitution";
  primaryFoodName: string;
  optionFoodName: string;
  quantity: string | null;
  unit: string | null;
  notes: string | null;
}

export interface ApprovedMealPlanAlternativeGroup {
  primaryFoodName: string;
  alternatives: ApprovedMealPlanAlternative[];
}

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function dedupeKey(item: Pick<ApprovedMealPlanAlternative, "primaryFoodName" | "optionFoodName" | "quantity" | "unit">): string {
  return [item.primaryFoodName, item.optionFoodName, item.quantity, item.unit].map(normalize).join("|");
}

function legacyAlternative(substitution: MealPlanSubstitutionPayload): ApprovedMealPlanAlternative {
  return {
    source: "legacy_substitution",
    primaryFoodName: substitution.base_food,
    optionFoodName: substitution.option_food,
    quantity: substitution.quantity ?? null,
    unit: substitution.unit ?? null,
    notes: substitution.notes ?? null,
  };
}

export function currentItemGramsForExchangeGroup(plan: MealPlanPayload, group: { primary_food_source: string; primary_food_ref_id: string; primary_food_name: string }): number | null {
  if (!Array.isArray(plan.meals)) return null;
  for (const meal of plan.meals) {
    for (const item of getMealStructureItems(meal)) {
      const identityMatches = item.food_source === group.primary_food_source && item.food_ref_id === group.primary_food_ref_id;
      const nameMatches = normalize(item.food) === normalize(group.primary_food_name);
      if (!identityMatches && !nameMatches) continue;
      return typeof item.resolved_grams_snapshot === "number" && Number.isFinite(item.resolved_grams_snapshot) ? item.resolved_grams_snapshot : null;
    }
  }
  return null;
}

export async function getApprovedMealPlanAlternatives(plan: MealPlanPayload): Promise<ApprovedMealPlanAlternativeGroup[]> {
  const seen = new Set<string>();
  const byPrimary = new Map<string, ApprovedMealPlanAlternative[]>();

  function add(item: ApprovedMealPlanAlternative) {
    const key = dedupeKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    const groupKey = normalize(item.primaryFoodName);
    const current = byPrimary.get(groupKey) ?? [];
    current.push(item);
    byPrimary.set(groupKey, current);
  }

  for (const { group, approved } of await listApprovedAlternativesForPlan(plan.id)) {
    const currentGrams = currentItemGramsForExchangeGroup(plan, group);
    if (currentGrams !== null && Math.abs(currentGrams - group.primary_quantity_grams) >= 0.1) continue;
    for (const alternative of approved) {
      add({
        source: "exchange_group",
        primaryFoodName: group.primary_food_name,
        optionFoodName: alternative.food_name,
        quantity: Number.isFinite(alternative.quantity_grams) ? String(Math.round(alternative.quantity_grams * 10) / 10) : null,
        unit: "g",
        notes: null,
      });
    }
  }

  for (const substitution of plan.substitutions) {
    if (substitution.approved_by_professional === false) continue;
    add(legacyAlternative(substitution));
  }

  return Array.from(byPrimary.values()).map((alternatives) => ({
    primaryFoodName: alternatives[0]?.primaryFoodName ?? "",
    alternatives,
  })).filter((group) => group.primaryFoodName && group.alternatives.length > 0);
}
