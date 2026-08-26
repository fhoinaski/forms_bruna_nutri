import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveQuantity } from "@/lib/nutrition/quantity-resolution";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("F4 multi-source food search view model", () => {
  it("uses the central quantity contract for a selected official measure", () => {
    expect(resolveQuantity({ quantity: "2", householdMeasure: { id: "portion-50", description: "1 unidade", gramEquivalent: 50, source: "IBGE", confidence: "high" } })).toMatchObject({ grams: 100, method: "food_household_measure" });
  });
  it("keeps same-name TBCA and IBGE rows separate, exposes preparation and renders missing macros as null", async () => {
    vi.doMock("@/lib/nutrition/canonical-food-search", () => ({
      canonicalFoodSearch: vi.fn().mockResolvedValue([
        { foodId: "tbca:egg-raw", source: "TBCA", sourceFoodId: "tbca-egg", name: "Ovo de galinha, cru", preparation: { name: "Cru", method: "RAW", code: "RAW" }, classification: { group: "Ovos", foodType: null }, matchMethod: "PREFIX" },
        { foodId: "ibge:egg-fried", source: "IBGE_POF", sourceFoodId: "ibge-egg", name: "Ovo de galinha, frito", preparation: { name: "Frito", method: "FRIED", code: "FRIED" }, classification: { group: "Ovos", foodType: null }, matchMethod: "PREFIX" },
      ]),
    }));
    vi.doMock("@/lib/repositories/canonical-foods", () => ({
      getSearchPreviews: vi.fn().mockResolvedValue({
        portionsByFoodId: new Map([
          ["tbca:egg-raw", [{ id: "tbca-p", label: "1 unidade", gramWeight: 50, mlWeight: null, parsedLabelGrams: null, weightSource: "structured_quantity", confidence: "high" }]],
          ["ibge:egg-fried", [{ id: "ibge-p", label: "1 unidade", gramWeight: 55, mlWeight: null, parsedLabelGrams: null, weightSource: "structured_quantity", confidence: "high" }]],
        ]),
        nutrientsByFoodId: new Map([
          ["tbca:egg-raw", [{ nutrientCode: "ENERGY_KCAL", value: 143, status: "reported" }, { nutrientCode: "PROTEIN", value: 12.5, status: "reported" }, { nutrientCode: "CARBOHYDRATE", value: null, status: "missing" }]],
          ["ibge:egg-fried", [{ nutrientCode: "ENERGY_KCAL", value: 196, status: "reported" }]],
        ]),
      }),
    }));
    vi.doMock("@/lib/nutrition/food-terminology", () => ({ toDisplayFoodName: (name: string) => name, normalizeFoodText: (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() }));

    const { buildMultiSourceFoodSearch } = await import("@/lib/nutrition/food-search-view-model");
    const items = await buildMultiSourceFoodSearch("ovo", [], 24);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.sourceCode)).toEqual(["TBCA", "IBGE_POF"]);
    expect(items.map((item) => item.preparation)).toEqual(["Cru", "Frito"]);
    expect(items[0].defaultPortion).toMatchObject({ id: "tbca-p", gramWeight: 50 });
    expect(items[0].nutrientsPreview.carbohydrateG).toBeNull();
    expect(items[1].nutrientsPreview.proteinG).toBeNull();
  });

  it("uses the explicit 100 g fallback when a source has no official household portion", async () => {
    vi.doMock("@/lib/nutrition/canonical-food-search", () => ({ canonicalFoodSearch: vi.fn().mockResolvedValue([
      { foodId: "taco:1", source: "TACO", sourceFoodId: "1", name: "Arroz", preparation: null, classification: null, matchMethod: "EXACT_NAME" },
    ]) }));
    vi.doMock("@/lib/repositories/canonical-foods", () => ({ getSearchPreviews: vi.fn().mockResolvedValue({ portionsByFoodId: new Map(), nutrientsByFoodId: new Map() }) }));
    vi.doMock("@/lib/nutrition/food-terminology", () => ({ toDisplayFoodName: (name: string) => name, normalizeFoodText: (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() }));
    const { buildMultiSourceFoodSearch } = await import("@/lib/nutrition/food-search-view-model");
    const [item] = await buildMultiSourceFoodSearch("arroz", [], 24);
    expect(item.defaultPortion).toEqual({ id: null, label: "100 g", gramWeight: 100, isFallback: true });
  });

  it("keeps TACO and USDA legacy identities visible as separate source choices", async () => {
    vi.doMock("@/lib/nutrition/canonical-food-search", () => ({ canonicalFoodSearch: vi.fn().mockResolvedValue([]) }));
    vi.doMock("@/lib/repositories/canonical-foods", () => ({ getSearchPreviews: vi.fn() }));
    vi.doMock("@/lib/nutrition/food-terminology", () => ({ toDisplayFoodName: (name: string) => name, normalizeFoodText: (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() }));
    const { buildMultiSourceFoodSearch } = await import("@/lib/nutrition/food-search-view-model");
    const items = await buildMultiSourceFoodSearch("ovo", [
      { numero: "489", descricao: "Ovo de galinha inteiro", name: "Ovo de galinha inteiro", displayName: "Ovo de galinha inteiro", grupo: "Ovos", group: "Ovos", energia_kcal: 143, proteina_g: 12.5, carboidrato_g: 0.7, lipidios_g: 9.5, energyKcal: 143, proteinG: 12.5, carbohydrateG: 0.7, fatG: 9.5, fiberG: null, ref: { source: "TACO", sourceId: "489" }, sourceLabel: "TACO" },
      { numero: "usda-1", descricao: "Egg whole", name: "Egg whole", displayName: "Egg whole", grupo: "Egg", group: "Egg", energia_kcal: 143, proteina_g: 12.5, carboidrato_g: 0.7, lipidios_g: 9.5, energyKcal: 143, proteinG: 12.5, carbohydrateG: 0.7, fatG: 9.5, fiberG: null, ref: { source: "USDA", sourceId: "usda-1" }, sourceLabel: "USDA" },
    ], 24);
    expect(items.map((item) => item.sourceCode)).toEqual(["TACO", "USDA"]);
  });
});
