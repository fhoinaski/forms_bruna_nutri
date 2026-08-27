import { describe, expect, it } from "vitest";
import { calculateFlexiblePlanNutrients, type FoodReferenceLookup } from "@/lib/nutrition/nutrients";

const lookup: FoodReferenceLookup = {
  byTacoNumber: (id) => ({ numero: id, descricao: id, energia_kcal: Number(id), proteina_g: Number(id) / 10, carboidrato_g: 0, lipidios_g: 0, fonte: "taco" }),
  byCustomId: () => null,
  fuzzyMatch: () => null,
};
const item = (kcal: number) => ({ food: String(kcal), quantity: "100", unit: "g", food_source: "TACO" as const, food_ref_id: String(kcal) });

describe("Meal Plan Composer nutrition engine", () => {
  it("does not add complete OPTIONS alternatives to the daily total", () => {
    const result = calculateFlexiblePlanNutrients({ meals: [{ name: "Café", meal_structure: "OPTIONS", items: [], options: [
      { label: "Opção 1", items: [item(300)] }, { label: "Opção 2", items: [item(500)] },
    ] }] }, lookup);
    expect(result.total.min.energyKcal).toBe(300);
    expect(result.total.max.energyKcal).toBe(500);
    expect(result.total.varies).toBe(true);
  });

  it("includes fixed COMBINATION items and selects independent min/max choices", () => {
    const result = calculateFlexiblePlanNutrients({ meals: [{ name: "Almoço", meal_structure: "COMBINATION", items: [item(100)], choice_groups: [
      { title: "Proteína", min_selections: 1, max_selections: 1, items: [item(200), item(300)] },
      { title: "Carboidrato", min_selections: 1, max_selections: 1, items: [item(80), item(120)] },
    ] }] }, lookup);
    expect(result.total.min.energyKcal).toBe(380);
    expect(result.total.max.energyKcal).toBe(520);
  });
});
