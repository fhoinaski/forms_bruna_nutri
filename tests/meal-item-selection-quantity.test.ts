import { describe, expect, it } from "vitest";
import { portionsForFoodSelection, suggestedGramsQuantity } from "@/components/dashboard/MealItemsEditor";
import type { FoodSearchResultViewModel } from "@/lib/nutrition/food-search-view-model";

const quailEgg: FoodSearchResultViewModel = {
  canonicalFoodId: "egg-raw",
  displayName: "Ovo de codorna",
  sourceName: "IBGE",
  sourceCode: "IBGE_POF",
  sourceFoodId: "7803201:99",
  preparation: "Cru(a)",
  group: null,
  defaultPortion: { id: "unit", label: "1 UNIDADE", gramWeight: 10, isFallback: false },
  availablePortions: [
    { id: "gram", label: "1 GRAMA", gramWeight: 1, isFallback: false },
    { id: "kilo", label: "1 QUILO", gramWeight: 1000, isFallback: false },
    { id: "unit", label: "1 UNIDADE", gramWeight: 10, isFallback: false },
  ],
  nutrientsPreview: { energyKcal: 158, proteinG: 13.1, carbohydrateG: 0.4, fatG: 11.1 },
  matchInfo: { rank: 0, method: "EXACT_NAME" },
};

describe("quantidade em gramas da busca de alimentos", () => {
  it("usa o peso da medida caseira do mesmo alimento ao selecionar gramas", () => {
    const portions = portionsForFoodSelection(quailEgg.availablePortions);
    expect(suggestedGramsQuantity(quailEgg, portions)).toBe("10");
  });
});
