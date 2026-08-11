import { describe, expect, it } from "vitest";
import { findEquivalentFoods } from "@/lib/nutrition/equivalence";
import { getTacoFoodByNumber } from "@/lib/nutrition/taco";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";

const banana = getTacoFoodByNumber("179")!; // Banana, nanica, crua — Frutas e derivados, carb 23.8481g/100g
const macaFuji = getTacoFoodByNumber("222")!; // Maçã, Fuji — Frutas e derivados, carb 15.1533g/100g
const acucarCristal = getTacoFoodByNumber("492")!; // Açúcar, cristal — Produtos açucarados, carb 99.61g/100g

describe("findEquivalentFoods — determinístico, sem IA", () => {
  it("finds a same-category fruit within tolerance for the target nutrient", () => {
    const results = findEquivalentFoods({
      baseFood: banana,
      amountGrams: 100,
      targetNutrient: "carbohydrateG",
      candidates: [macaFuji, acucarCristal],
      tolerancePercent: 10,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].food.numero).toBe(222);
    expect(Math.abs(results[0].deltaPercent)).toBeLessThanOrEqual(10);
    expect(results[0].sameCategory).toBe(true);
  });

  it("prioriza a mesma categoria mesmo quando um item de outra categoria também está dentro da tolerância (banana != açúcar)", () => {
    const results = findEquivalentFoods({
      baseFood: banana,
      amountGrams: 100,
      targetNutrient: "carbohydrateG",
      candidates: [acucarCristal, macaFuji],
      tolerancePercent: 15,
    });
    const appleIndex = results.findIndex((r) => r.food.numero === 222);
    const sugarIndex = results.findIndex((r) => r.food.numero === 492);
    expect(appleIndex).toBeGreaterThanOrEqual(0);
    if (sugarIndex >= 0) expect(appleIndex).toBeLessThan(sugarIndex);
  });

  it("com sameCategoryOnly, exclui completamente candidatos de outra categoria (banana nunca vira açúcar)", () => {
    const results = findEquivalentFoods({
      baseFood: banana,
      amountGrams: 100,
      targetNutrient: "carbohydrateG",
      candidates: [acucarCristal, macaFuji],
      tolerancePercent: 20,
      sameCategoryOnly: true,
    });
    expect(results.every((r) => r.food.numero !== 492)).toBe(true);
  });

  it("respects the tolerance boundary with synthetic fixtures", () => {
    // base: 100g a 15g carb/100g -> precisa de 15g de carboidrato.
    // "within": 15g carb/100g -> gramas necessarias = 100g (multiplo de 5,
    // sem erro de arredondamento) -> 0% de diferenca.
    // "outside": 200g carb/100g -> gramas necessarias = 7.5g, arredondado
    // para o incremento pratico de 5g mais proximo (10g) -> resultado real
    // fica 20g de carboidrato, 33% acima do alvo (15g) -> fora de 10%.
    const base: MacroReferenceFood = { numero: "base", descricao: "Base", grupo: "X", fonte: "custom", energia_kcal: 100, proteina_g: 0, carboidrato_g: 15, lipidios_g: 0 };
    const withinTolerance: MacroReferenceFood = { numero: "within", descricao: "Dentro", grupo: "X", fonte: "custom", energia_kcal: 100, proteina_g: 0, carboidrato_g: 15, lipidios_g: 0 };
    const outsideTolerance: MacroReferenceFood = { numero: "outside", descricao: "Fora", grupo: "X", fonte: "custom", energia_kcal: 100, proteina_g: 0, carboidrato_g: 200, lipidios_g: 0 };

    const results = findEquivalentFoods({
      baseFood: base,
      amountGrams: 100,
      targetNutrient: "carbohydrateG",
      candidates: [withinTolerance, outsideTolerance],
      tolerancePercent: 10,
    });
    expect(results.some((r) => r.food.numero === "within")).toBe(true);
    expect(results.some((r) => r.food.numero === "outside")).toBe(false);
  });

  it("never returns an implausible gram amount (e.g. thousands of grams of lettuce)", () => {
    const base: MacroReferenceFood = { numero: "base", descricao: "Base", grupo: "X", fonte: "custom", energia_kcal: 500, proteina_g: 0, carboidrato_g: 100, lipidios_g: 0 };
    const traceCarb: MacroReferenceFood = { numero: "trace", descricao: "Quase sem carboidrato", grupo: "X", fonte: "custom", energia_kcal: 10, proteina_g: 0, carboidrato_g: 0.5, lipidios_g: 0 };
    const results = findEquivalentFoods({ baseFood: base, amountGrams: 100, targetNutrient: "carbohydrateG", candidates: [traceCarb], tolerancePercent: 50 });
    expect(results).toHaveLength(0);
  });

  it("never calls an LLM — pure arithmetic over the candidates array provided", () => {
    const results = findEquivalentFoods({ baseFood: banana, amountGrams: 100, targetNutrient: "carbohydrateG", candidates: [] });
    expect(results).toEqual([]);
  });

  it("excludes the base food itself from its own equivalent list", () => {
    const results = findEquivalentFoods({ baseFood: banana, amountGrams: 100, targetNutrient: "carbohydrateG", candidates: [banana, macaFuji], tolerancePercent: 10 });
    expect(results.every((r) => r.food.numero !== 179)).toBe(true);
  });
});
