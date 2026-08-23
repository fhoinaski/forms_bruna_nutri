import { describe, expect, it } from "vitest";
import { mealPlanItemAlternativeSummary, mealPlanItemDisplayQuantity } from "@/components/dashboard/MealItemsEditor";

describe("R3 meal plan editor UX helpers", () => {
  it("exibe a quantidade prescrita sem depender do calculo nutricional", () => {
    expect(mealPlanItemDisplayQuantity({ quantity: "120", unit: "g", household_measure_id: null })).toBe("120 g");
    expect(mealPlanItemDisplayQuantity({ quantity: "2", unit: null, household_measure_id: "portion-1" })).toBe("2 medida");
    expect(mealPlanItemDisplayQuantity({ quantity: "", unit: "", household_measure_id: null })).toBe("Porcao a definir");
  });

  it("resume alternativas com linguagem clinica curta", () => {
    expect(mealPlanItemAlternativeSummary(4, 0)).toBe("4 alternativas");
    expect(mealPlanItemAlternativeSummary(0, 2)).toBe("2 para revisar");
    expect(mealPlanItemAlternativeSummary(0, 0)).toBe("Gerar alternativas");
  });
});
