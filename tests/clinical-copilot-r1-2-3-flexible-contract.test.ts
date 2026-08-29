import { describe, expect, it } from "vitest";
import { draftMealLlmSchema, prepareMealRawForParse } from "@/lib/ai/agents/nutrition/meal-plan-draft-agent";
import { draftMealToMealFlex } from "@/lib/nutrition/draft-meal-flex";
import { calculateMealNutritionRange } from "@/lib/meal-plans/flexible-structure";

const item = { query: "arroz branco cozido", quantity: 100, unit: "g" };
const mealKey = "almoco";

describe("R1.2.3 flexible draft contract", () => {
  it("accepts each explicit structured shape and rejects mixed/unknown ones", () => {
    // Mesmo formato SIMPLE legado usado pelas fixtures E2E é normalizado na
    // própria fronteira (`prepareMealRawForParse`) antes do parse Zod real.
    expect(draftMealLlmSchema.safeParse(prepareMealRawForParse({ mealKey, recipeId: null, items: [item] })).success).toBe(true);
    expect(draftMealLlmSchema.safeParse({ mealKey, recipeId: null, structure: "SIMPLE", items: [item] }).success).toBe(true);
    // OPTIONS/COMBINATION nunca carregam "recipeId"/"items" de nível de refeição (só os campos da própria estrutura).
    expect(draftMealLlmSchema.safeParse({ mealKey, structure: "OPTIONS", options: [{ label: "A", items: [item] }, { label: "B", items: [item] }] }).success).toBe(true);
    expect(draftMealLlmSchema.safeParse({ mealKey, structure: "COMBINATION", fixed_items: [], choice_groups: [{ title: "Proteína", min_selections: 1, max_selections: 1, items: [item] }] }).success).toBe(true);
    expect(draftMealLlmSchema.safeParse({ mealKey, recipeId: null, structure: "SIMPLE", items: [item], options: [] }).success).toBe(false);
    expect(draftMealLlmSchema.safeParse({ mealKey, recipeId: null, structure: "UNKNOWN", items: [item] }).success).toBe(false);
  });

  it("maps nested resolved items to the existing Meal Flex payload without flattening", () => {
    const food = { food: "Arroz, branco, cozido", displayName: "Arroz branco cozido", quantity: "100", unit: "g", food_source: "TACO" as const, food_ref_id: "1", ai_suggested: true as const, preparation: "cozido", is_optional: true };
    const mapped = draftMealToMealFlex({
      mealKey: "almoco", name: "Almoço", suggested_time: "12:00", source_recipe_id: null, meal_structure: "COMBINATION",
      items: [food],
      choice_groups: [{ id: "group-0", title: "Proteína", min_selections: 1, max_selections: 1, items: [food], needsReview: [] }],
      needsReview: [],
    });
    expect(mapped.meal_structure).toBe("COMBINATION");
    expect(mapped.items[0].is_optional).toBe(true);
    expect(mapped.items[0].notes).toBe("cozido");
    expect(mapped.choice_groups?.[0].items[0].food_ref_id).toBe("1");
  });

  it("calculates OPTIONS as a range, never as the sum of alternatives", () => {
    const range = calculateMealNutritionRange({ name: "Lanche", meal_structure: "OPTIONS", items: [], options: [
      { label: "A", items: [{ food: "A" }] }, { label: "B", items: [{ food: "B" }] },
    ] }, (food) => ({ energyKcal: food.food === "A" ? 300 : 400, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0 }));
    expect(range.min.energyKcal).toBe(300);
    expect(range.max.energyKcal).toBe(400);
  });
});
