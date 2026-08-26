import { describe, expect, it } from "vitest";
import { analyzeMeasure, analyzeNutrient } from "../scripts/food-data/nutrium-anomaly-detector.mjs";
import { normalizeMeasure, normalizeNutrientLabel, normalizeSource } from "../scripts/food-data/nutrium-normalizer.mjs";

describe("Nutrium F1 normalizers", () => {
  it("preserves null as missing and zero as reported", () => {
    expect(analyzeNutrient({ nutrientId: "1", normalizedLabel: "Proteína", unit: "g", value: null }).flags).toContain("MISSING");
    expect(analyzeNutrient({ nutrientId: "1", normalizedLabel: "Proteína", unit: "g", value: 0 }).flags).toContain("REPORTED_ZERO");
  });
  it("is unit-sensitive for micronutrients", () => {
    expect(analyzeNutrient({ nutrientId: "25", normalizedLabel: "Potássio", unit: "mg", value: 4000 }).flags).not.toContain("PHYSICALLY_SUSPICIOUS");
  });
  it("reports impossible macro values and only suggests decimal candidates", () => {
    const analysis = analyzeNutrient({ nutrientId: "118", normalizedLabel: "Gorduras monoinsaturadas", unit: "g", value: 4441 }, { totalFat: 10.98, multipleFatComponentsSameScale: true });
    expect(analysis.rawValue).toBe(4441);
    expect(analysis.flags).toContain("PHYSICALLY_SUSPICIOUS");
    expect(analysis.candidateCorrections).toContainEqual(expect.objectContaining({ candidateValue: 4.441, scaleFactor: 1000 }));
  });
  it("detects fat components larger than total fat", () => {
    const analysis = analyzeNutrient({ nutrientId: "91", normalizedLabel: "Gorduras saturadas", unit: "g", value: 23 }, { totalFat: 10 });
    expect(analysis.flags).toContain("COMPONENT_GT_TOTAL");
  });
  it("normalizes known icon prefixes and source labels", () => {
    expect(normalizeNutrientLabel("local_fire_departmentEnergia")).toMatchObject({ rawLabel: "local_fire_departmentEnergia", normalizedLabel: "Energia" });
    expect(normalizeSource("USDA, 2018")).toMatchObject({ sourceFamily: "USDA", sourceYear: 2018, sourceClassification: "PUBLIC_DATABASE" });
  });
  it("validates common measures without changing raw values", () => {
    expect(analyzeMeasure(normalizeMeasure({ singular: "unidade grande", grams: 61, ediblePortionPercentage: null })).flags).toContain("MISSING_EDIBLE_PORTION");
    expect(analyzeMeasure(normalizeMeasure({ singular: "unidade", grams: 0, ediblePortionPercentage: 100 })).flags).toContain("INVALID_GRAMS");
  });
});
