import { describe, expect, it } from "vitest";
import { estimateFoodMacros, estimateMacrosFromLine, roundedMacros, sumMacros } from "@/lib/nutrition/macros";
import { coerceTacoNumber, estimateFoodMacrosFromTaco, getTacoFoodByNumber, searchTacoFoods } from "@/lib/nutrition/taco";

describe("live macro estimation", () => {
  it("calculates an exact TACO food from grams", () => {
    const [arroz] = searchTacoFoods("Arroz, integral, cozido");
    const result = roundedMacros(estimateFoodMacros("Arroz, integral, cozido", "100", "g", [arroz]));
    expect(arroz.descricao).toBe("Arroz, integral, cozido");
    expect(result.kcal).toBe(124);
    expect(result.carbs).toBe(25.8);
    expect(result.recognizedItems).toBe(1);
  });

  it("prefers exact normalized descriptions before broader contains matches", () => {
    const [exact] = searchTacoFoods("Leite, de vaca, integral");
    const [ambiguous] = searchTacoFoods("leite");
    expect(exact.descricao).toBe("Leite, de vaca, integral");
    expect(ambiguous.descricao.toLowerCase()).toContain("leite");
    expect(ambiguous.descricao).not.toBe("Canjica, com leite integral");
  });

  it("treats TACO NA and Tr values as zero", () => {
    expect(coerceTacoNumber("NA")).toBe(0);
    expect(coerceTacoNumber("Tr")).toBe(0);
    expect(coerceTacoNumber(null)).toBe(0);
  });

  it("parses imported protocol meal lines with TACO references", () => {
    const references = searchTacoFoods("Frango, peito, sem pele, grelhado");
    const result = roundedMacros(estimateMacrosFromLine("Frango, peito, sem pele, grelhado - 150 g", references));
    expect(result.kcal).toBeGreaterThan(200);
    expect(result.protein).toBeGreaterThan(40);
  });

  it("keeps unrecognized foods visible in coverage totals", () => {
    const banana = searchTacoFoods("Banana, prata, crua")[0];
    const result = sumMacros([
      estimateFoodMacros("Banana, prata, crua", "100", "g", [banana]),
      estimateFoodMacros("Alimento nao catalogado", "100", "g", [banana]),
    ]);
    expect(result.totalItems).toBe(2);
    expect(result.recognizedItems).toBe(1);
  });

  it("covers foods that were not in the old manual list", () => {
    const foods = [
      "Açaí, polpa, congelada",
      "Tucumã, cru",
      "Inhame, cru",
      "Cuscuz, de milho, cozido com sal",
      "Abóbora, cabotian, cozida",
    ];
    const results = foods.map((food) => roundedMacros(estimateFoodMacrosFromTaco(food, 100, "g")));
    expect(results.every((result) => result.recognizedItems === 1)).toBe(true);
    expect(results.every((result) => result.kcal > 0)).toBe(true);
  });

  it("searches complementary TBCA/USDA foods together with official TACO foods", () => {
    const [whey] = searchTacoFoods("whey protein");
    const lookup = getTacoFoodByNumber(1054);
    const macros = roundedMacros(estimateFoodMacrosFromTaco("Suplemento, proteína, em pó (whey protein)", 30, "g"));

    expect(whey.descricao).toBe("Suplemento, proteína, em pó (whey protein)");
    expect(whey.fonte).toBe("complementar");
    expect(lookup?.descricao).toBe(whey.descricao);
    expect(macros.kcal).toBe(116);
    expect(macros.protein).toBe(24);
    expect(macros.carbs).toBe(2.4);
    expect(macros.fat).toBe(2.3);
  });
});
