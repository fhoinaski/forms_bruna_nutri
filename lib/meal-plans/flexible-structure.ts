import type { MealPlanItemPayload, MealPlanMealPayload } from "@/lib/repositories/meal-plans";

export type MealStructureType = "SIMPLE" | "OPTIONS" | "COMBINATION";

export type MealOptionPayload = { id?: string; label: string; description?: string | null; items: MealPlanItemPayload[] };
export type MealChoiceGroupPayload = {
  id?: string; title: string; description?: string | null; min_selections: number; max_selections: number; items: MealPlanItemPayload[];
};

export function getMealStructure(meal: Pick<MealPlanMealPayload, "meal_structure">): MealStructureType {
  return meal.meal_structure === "OPTIONS" || meal.meal_structure === "COMBINATION" ? meal.meal_structure : "SIMPLE";
}

/**
 * Returns every prescribed item carried by a meal, including alternatives.
 * Identity, portion, and safety validation must not silently skip flexible
 * branches. Nutrition ranges are calculated separately, so this never makes
 * alternatives additive.
 */
export function getMealStructureItems(meal: Pick<MealPlanMealPayload, "items" | "options" | "choice_groups">): MealPlanItemPayload[] {
  return [
    ...meal.items,
    ...(meal.options ?? []).flatMap((option) => option.items),
    ...(meal.choice_groups ?? []).flatMap((group) => group.items),
  ];
}

export function validateMealStructure(meal: MealPlanMealPayload): string[] {
  const structure = getMealStructure(meal);
  const options = meal.options ?? [];
  const groups = meal.choice_groups ?? [];
  const errors: string[] = [];
  if (structure === "OPTIONS" && !options.length) errors.push("Uma refeição de opções precisa ter ao menos uma opção.");
  if (structure === "COMBINATION" && !groups.length) errors.push("Uma refeição combinável precisa ter ao menos um grupo de escolha.");
  for (const option of options) if (!option.label.trim()) errors.push("Toda opção precisa de um nome.");
  for (const group of groups) {
    if (!group.title.trim()) errors.push("Todo grupo de escolha precisa de um título.");
    if (!Number.isInteger(group.min_selections) || !Number.isInteger(group.max_selections) || group.min_selections < 0 || group.max_selections < group.min_selections || group.max_selections === 0) {
      errors.push(`Grupo “${group.title || "sem título"}” tem limites de escolha inválidos.`);
    }
    if (group.items.length < group.min_selections) errors.push(`Grupo “${group.title || "sem título"}” não tem alternativas suficientes.`);
  }
  return errors;
}

export type FlexibleNutrientValues = { energyKcal: number; proteinG: number; carbohydrateG: number; fatG: number; fiberG: number };
export type NutritionRange = { min: FlexibleNutrientValues; max: FlexibleNutrientValues; varies: boolean };
const zero = (): FlexibleNutrientValues => ({ energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0 });
const add = (a: FlexibleNutrientValues, b: FlexibleNutrientValues): FlexibleNutrientValues => ({
  energyKcal: a.energyKcal + b.energyKcal, proteinG: a.proteinG + b.proteinG, carbohydrateG: a.carbohydrateG + b.carbohydrateG, fatG: a.fatG + b.fatG, fiberG: a.fiberG + b.fiberG,
});

/** Computes independent option/group bounds, never a Cartesian product. */
export function calculateMealNutritionRange(
  meal: MealPlanMealPayload,
  valuesFor: (item: MealPlanItemPayload) => FlexibleNutrientValues
): NutritionRange {
  const itemRange = (items: MealPlanItemPayload[]) => items.reduce((range, item) => {
    const value = valuesFor(item);
    return { min: add(range.min, item.is_optional ? zero() : value), max: add(range.max, value), varies: range.varies || Boolean(item.is_optional) };
  }, { min: zero(), max: zero(), varies: false });
  const fixed = itemRange(meal.items);
  if (getMealStructure(meal) === "SIMPLE") return fixed;
  if (getMealStructure(meal) === "OPTIONS") {
    const ranges = (meal.options ?? []).map((option) => itemRange(option.items));
    if (!ranges.length) return fixed;
    const keys: Array<keyof FlexibleNutrientValues> = ["energyKcal", "proteinG", "carbohydrateG", "fatG", "fiberG"];
    const min = { ...fixed.min }; const max = { ...fixed.max };
    for (const key of keys) { min[key] += Math.min(...ranges.map((range) => range.min[key])); max[key] += Math.max(...ranges.map((range) => range.max[key])); }
    return { min, max, varies: true };
  }
  let result = fixed;
  for (const group of meal.choice_groups ?? []) {
    const ranked = group.items.map(valuesFor);
    const keys: Array<keyof FlexibleNutrientValues> = ["energyKcal", "proteinG", "carbohydrateG", "fatG", "fiberG"];
    const min = { ...result.min }; const max = { ...result.max };
    for (const key of keys) {
      const sorted = ranked.map((value) => value[key]).sort((a, b) => a - b);
      min[key] += sorted.slice(0, group.min_selections).reduce((sum, value) => sum + value, 0);
      max[key] += sorted.slice(Math.max(0, sorted.length - group.max_selections)).reduce((sum, value) => sum + value, 0);
    }
    result = { min, max, varies: true };
  }
  return result;
}
