import { describe, expect, it } from "vitest";
import { searchAllFoods } from "@/lib/nutrition/food-search";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";

const customWheyMock: MacroReferenceFood = {
  numero: "custom-1",
  descricao: "Whey Protein Isolado (Marca X)",
  fonte: "custom",
  energia_kcal: 380,
  proteina_g: 80,
  carboidrato_g: 5,
  lipidios_g: 3,
};

describe("searchAllFoods", () => {
  it("ranks an exact match above a starts-with match, which ranks above a contains match", () => {
    const results = searchAllFoods("banana, prata, crua");
    expect(results[0].food.descricao).toBe("Banana, prata, crua");
  });

  it("is accent- and case-insensitive", () => {
    const lower = searchAllFoods("banana");
    const upper = searchAllFoods("BANANA");
    const accented = searchAllFoods("bánana");
    expect(lower.length).toBeGreaterThan(0);
    expect(upper.map((r) => r.food.descricao)).toEqual(lower.map((r) => r.food.descricao));
    expect(accented.map((r) => r.food.descricao)).toEqual(lower.map((r) => r.food.descricao));
  });

  it("prefers foods whose name starts with the query over foods that merely contain it", () => {
    const results = searchAllFoods("leite");
    const startsWithLeite = results.findIndex((r) => r.food.descricao.toLowerCase().startsWith("leite"));
    const containsOnly = results.findIndex((r) => !r.food.descricao.toLowerCase().startsWith("leite") && r.food.descricao.toLowerCase().includes("leite"));
    if (startsWithLeite >= 0 && containsOnly >= 0) {
      expect(startsWithLeite).toBeLessThan(containsOnly);
    }
  });

  it("tags every result with a source (TACO by default)", () => {
    const results = searchAllFoods("arroz");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.source === "TACO")).toBe(true);
  });

  it("merges custom foods into the same ranked result set, tagged as CUSTOM", () => {
    const results = searchAllFoods("whey", { customFoods: [customWheyMock] });
    expect(results.some((r) => r.source === "CUSTOM" && r.food.numero === "custom-1")).toBe(true);
  });

  it("filters by source when requested", () => {
    const results = searchAllFoods("whey protein isolado", { customFoods: [customWheyMock], source: "TACO" });
    expect(results.every((r) => r.source === "TACO")).toBe(true);
  });

  it("returns nothing for a too-short query, never a random dump of foods", () => {
    expect(searchAllFoods("a")).toEqual([]);
  });

  it("caps results at the requested limit", () => {
    const results = searchAllFoods("de", { limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
