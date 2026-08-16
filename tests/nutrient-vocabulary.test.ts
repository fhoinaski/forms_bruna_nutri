import { describe, expect, it } from "vitest";
import { NUTRIENT_BY_CODE, NUTRIENT_BY_V3_COLUMN, USDA_V3_NUTRIENT_COLUMNS } from "@/lib/nutrition/nutrient-vocabulary";
import { calculateNutrientsForAmount, calculateItemNutrients, getFoodNutrientsFromReference } from "@/lib/nutrition/nutrients";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";

const usdaRice: MacroReferenceFood = {
  numero: "USDA_SR_LEGACY:169756",
  descricao: "Rice, white, long-grain, regular, cooked",
  fonte: "usda",
  energia_kcal: 130,
  energy_kj: 544,
  proteina_g: 2.69,
  carboidrato_g: 28.17,
  sugars_g: 0.05,
  lipidios_g: 0.28,
  fibra_g: 0.4,
  calcio_mg: 10,
  ferro_mg: 1.2,
  magnesium_mg: 12,
  phosphorus_mg: 43,
  potassio_mg: 35,
  zinc_mg: 0.49,
  selenium_mcg: 7.5,
  vitamin_a_mcg: null,
  vitamina_c_mg: null,
  vitamin_b1_mg: 0.02,
  vitamin_b2_mg: 0.013,
  vitamin_b3_mg: 0.4,
  vitamin_b6_mg: 0.093,
  folate_mcg: 58,
  vitamin_b12_mcg: 0,
};

describe("nutrient vocabulary and composition", () => {
  it("mantem unidades centrais distintas para vitaminas e minerais", () => {
    expect(NUTRIENT_BY_CODE.VITAMIN_A.unit).toBe("mcg");
    expect(NUTRIENT_BY_CODE.VITAMIN_C.unit).toBe("mg");
    expect(NUTRIENT_BY_CODE.VITAMIN_D.unit).toBe("mcg");
    expect(NUTRIENT_BY_CODE.VITAMIN_E.unit).toBe("mg");
    expect(NUTRIENT_BY_CODE.THIAMIN.unit).toBe("mg");
    expect(NUTRIENT_BY_CODE.VITAMIN_B12.unit).toBe("mcg");
    expect(NUTRIENT_BY_V3_COLUMN.calcium_mg.code).toBe("CALCIUM");
    expect(USDA_V3_NUTRIENT_COLUMNS).toContain("cholesterol_mg");
  });

  it("escala macros e micros para uma quantidade sem transformar NULL em zero", () => {
    const nutrients = calculateNutrientsForAmount(usdaRice, 50);
    expect(nutrients.find((item) => item.code === "CALCIUM")).toMatchObject({ value: 5, unit: "mg", basis: { amount: 50, unit: "g" } });
    expect(nutrients.find((item) => item.code === "SELENIUM")).toMatchObject({ value: 3.75, unit: "mcg" });
    expect(nutrients.find((item) => item.code === "VITAMIN_A")?.value).toBeNull();

    const item = calculateItemNutrients("50", "g", usdaRice);
    expect(item.values.calciumMg).toBe(5);
    expect(item.values.magnesiumMg).toBe(6);
    expect(item.values.vitaminAMcg).toBeNull();
  });

  it("exporta composicao por 100 g com source preservado", () => {
    const values = getFoodNutrientsFromReference(usdaRice, "USDA");
    expect(values.find((item) => item.code === "ENERGY_KCAL")).toMatchObject({ value: 130, unit: "kcal", source: "USDA" });
    expect(values.find((item) => item.code === "FOLATE")).toMatchObject({ value: 58, unit: "mcg" });
  });
});
