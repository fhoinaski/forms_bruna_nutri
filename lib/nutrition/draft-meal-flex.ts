import type { MealPlanItemPayload, MealPlanMealPayload } from "@/lib/repositories/meal-plans";
import type { DraftMeal, DraftMealItem } from "@/lib/nutrition/draft-types";

/**
 * Único adaptador do contrato transitório do draft para o domínio Meal Flex.
 * Não persiste nem inventa identidade: somente transporta itens já resolvidos.
 */
export function draftItemToMealPlanItem(item: DraftMealItem): MealPlanItemPayload {
  return {
    food: item.food,
    quantity: item.quantity,
    unit: item.unit,
    notes: item.preparation ?? null,
    is_optional: item.is_optional ?? false,
    ai_suggested: true,
    food_source: item.food_source,
    food_ref_id: item.food_ref_id,
  } as MealPlanItemPayload;
}

export function draftMealToMealFlex(meal: DraftMeal): MealPlanMealPayload {
  return {
    name: meal.name,
    suggested_time: meal.suggested_time,
    notes: null,
    source_recipe_id: meal.source_recipe_id,
    meal_structure: meal.meal_structure ?? "SIMPLE",
    items: meal.items.map(draftItemToMealPlanItem),
    options: meal.options?.map((option) => ({
      label: option.label,
      description: option.description ?? null,
      items: option.items.map(draftItemToMealPlanItem),
    })),
    choice_groups: meal.choice_groups?.map((group) => ({
      title: group.title,
      description: group.description ?? null,
      min_selections: group.min_selections,
      max_selections: group.max_selections,
      items: group.items.map(draftItemToMealPlanItem),
    })),
  };
}
