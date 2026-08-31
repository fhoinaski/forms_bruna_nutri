import { describe, expect, it } from "vitest";
import { rankFoodSearchResults } from "@/lib/nutrition/food-search-ranking";
import type { FoodSearchResultViewModel } from "@/lib/nutrition/food-search-view-model";

function item(overrides: Partial<FoodSearchResultViewModel>): FoodSearchResultViewModel {
  return {
    canonicalFoodId: null, displayName: "Arroz integral", sourceName: "TACO", sourceCode: "TACO", sourceFoodId: "1", preparation: null, group: null,
    defaultPortion: { id: null, label: "100 g", gramWeight: 100, isFallback: true }, availablePortions: [{ id: null, label: "100 g", gramWeight: 100, isFallback: true }],
    nutrientsPreview: { energyKcal: null, proteinG: null, carbohydrateG: null, fatG: null }, matchInfo: { rank: 0, method: "TEST" }, ...overrides,
  };
}

describe("F5 deterministic food search ranking", () => {
  it("puts exact text ahead of a partial result even when the partial source is preferred", () => {
    const ranked = rankFoodSearchResults("arroz integral", [item({ displayName: "Farinha de arroz integral", sourceCode: "TBCA", sourceName: "TBCA", sourceFoodId: "tbca" }), item({ displayName: "Arroz integral", sourceCode: "USDA", sourceName: "USDA", sourceFoodId: "usda" })]);
    expect(ranked[0].sourceCode).toBe("USDA");
    expect(ranked[0].rankingFeatures).toContain("EXACT_NORMALIZED_NAME");
  });

  it("ranks preparation match above an explicit mismatch", () => {
    const ranked = rankFoodSearchResults("ovo cozido", [item({ displayName: "Ovo de galinha frito", preparation: "Frito", sourceFoodId: "fried" }), item({ displayName: "Ovo de galinha cozido", preparation: "Cozido", sourceFoodId: "cooked" })]);
    expect(ranked.map((value) => value.sourceFoodId)).toEqual(["cooked", "fried"]);
  });

  it("uses source only as a stable tie-break and is repeatable", () => {
    const candidates = [item({ displayName: "Banana prata", sourceCode: "USDA", sourceName: "USDA", sourceFoodId: "u" }), item({ displayName: "Banana prata", sourceCode: "TBCA", sourceName: "TBCA", sourceFoodId: "t" })];
    const orders = Array.from({ length: 20 }, () => rankFoodSearchResults("banana prata", candidates).map((value) => value.sourceCode));
    expect(orders.every((order) => order.join(",") === "TBCA,USDA")).toBe(true);
  });

  it("prefers a prefix result over a later contains-only result", () => {
    const ranked = rankFoodSearchResults("banana", [item({ displayName: "Vitamina com banana", sourceFoodId: "contains" }), item({ displayName: "Banana prata", sourceFoodId: "prefix" })]);
    expect(ranked.map((value) => value.sourceFoodId)).toEqual(["prefix", "contains"]);
    expect(ranked[0].rankingFeatures).toContain("PREFIX_MATCH");
  });

  it("recognizes all query tokens when their order differs from the food name", () => {
    const ranked = rankFoodSearchResults("peito frango", [item({ displayName: "Frango, peito, sem pele", sourceFoodId: "tokens" }), item({ displayName: "Frango assado", sourceFoodId: "partial" })]);
    expect(ranked[0].sourceFoodId).toBe("tokens");
    expect(ranked[0].rankingFeatures).toContain("ALL_QUERY_TOKENS");
  });

  it("keeps a generic query from being dominated by a branded partial result", () => {
    const ranked = rankFoodSearchResults("iogurte", [item({ displayName: "Iogurte Marca Exemplo com morango", sourceCode: "MANUFACTURER", sourceName: "Marca", sourceFoodId: "brand" }), item({ displayName: "Iogurte", sourceCode: "TACO", sourceFoodId: "generic" })]);
    expect(ranked[0].sourceFoodId).toBe("generic");
  });

  it("puts concise base foods before very specific preparations for a generic query", () => {
    const ranked = rankFoodSearchResults("pão", [
      item({ displayName: "Pão bisnaguinha com farinha de trigo refinada", sourceFoodId: "specific" }),
      item({ displayName: "Pão integral", sourceFoodId: "integral" }),
      item({ displayName: "Pão", sourceFoodId: "base" }),
    ]);
    expect(ranked.map((value) => value.sourceFoodId)).toEqual(["base", "integral", "specific"]);
    expect(ranked[0].rankingFeatures).toContain("CONCISE_BASE_FOOD");
  });

  it("keeps an exact branded query relevant when the user explicitly asks for it", () => {
    const ranked = rankFoodSearchResults("iogurte marca exemplo", [item({ displayName: "Iogurte", sourceCode: "TACO", sourceFoodId: "generic" }), item({ displayName: "Iogurte Marca Exemplo", sourceCode: "MANUFACTURER", sourceName: "Marca", sourceFoodId: "brand" })]);
    expect(ranked[0].sourceFoodId).toBe("brand");
  });

  it("gives a small portion signal without defeating exact textual relevance", () => {
    const ranked = rankFoodSearchResults("batata doce", [item({ displayName: "Batata inglesa com batata doce", sourceFoodId: "partial", availablePortions: [{ id: "p", label: "1 unidade", gramWeight: 80, isFallback: false }] }), item({ displayName: "Batata doce", sourceFoodId: "exact" })]);
    expect(ranked[0].sourceFoodId).toBe("exact");
  });
});
