import { describe, expect, it } from "vitest";
import { buildCanonicalIndexes, captureModel, matchCaptureFood } from "../scripts/food-data/canonical-food-matcher.mjs";
import { compareNutrients, nutritionStatus } from "../scripts/food-data/nutrient-comparator.mjs";
import { comparePortions } from "../scripts/food-data/portion-comparator.mjs";

const source = { rawSourceLabel: "TACO, NEPA", sourceFamily: "TACO", sourceYear: null, sourceSecondary: "NEPA", sourceClassification: "PUBLIC_DATABASE" };
const canonical = [{ id: "taco:1", source: "TACO", sourceFoodId: "1", name: "Ovo, galinha, inteiro, cozido", normalizedName: "", preparationMethod: "cozido", preparationName: null }];

describe("Nutrium F2 reconciliation", () => {
  it("uses exact source IDs before names", () => {
    const result = matchCaptureFood(captureModel({ externalId: "1", name: "qualquer nome" }, source), buildCanonicalIndexes(canonical));
    expect(result.matchType).toBe("MATCH_EXACT_SOURCE_ID");
  });
  it("does not auto-accept a different preparation", () => {
    const result = matchCaptureFood(captureModel({ externalId: "x", name: "Ovo, galinha, inteiro, frito" }, source), buildCanonicalIndexes(canonical));
    expect(result.matchType).not.toBe("MATCH_EXACT_NORMALIZED_NAME");
  });
  it("keeps ambiguous names unresolved", () => {
    const indexes = buildCanonicalIndexes([{ id: "a", source: "TACO", sourceFoodId: "a", name: "Pão", normalizedName: "", preparationMethod: null, preparationName: null }, { id: "b", source: "TACO", sourceFoodId: "b", name: "Pão", normalizedName: "", preparationMethod: null, preparationName: null }]);
    expect(matchCaptureFood(captureModel({ externalId: "x", name: "Pão" }, source), indexes).matchType).toBe("MATCH_AMBIGUOUS");
  });
  it("does not auto-match an unknown brand/source", () => {
    const unknown = { ...source, sourceFamily: "UNKNOWN", sourceClassification: "UNKNOWN" };
    expect(matchCaptureFood(captureModel({ externalId: "1", name: "Ovo, galinha, inteiro, cozido" }, unknown), buildCanonicalIndexes(canonical)).matchType).toBe("MATCH_REVIEW_REQUIRED");
  });
  it("confirms a decimal candidate only against canonical evidence", () => {
    const comparisons = compareNutrients([{ nutrientId: "118", rawValue: 4441, unit: "g", candidateCorrections: [{ candidateValue: 4.441, scaleFactor: 1000 }] }], [{ nutrientCode: "MONOUNSATURATED_FAT", value: 4.441, unit: "g" }]);
    expect(comparisons[0].decimalStatus).toBe("DECIMAL_CONFIRMED_X1000");
    expect(nutritionStatus(comparisons, true)).toBe("CAPTURE_CORRUPTED_CANONICAL_AVAILABLE");
  });
  it("distinguishes exact and conflicting portions", () => {
    expect(comparePortions([{ singular: "unidade grande", grams: 61 }], [{ label: "unidade grande", gramWeight: 61 }])[0].status).toBe("PORTION_EXACT");
    expect(comparePortions([{ singular: "unidade", grams: 61 }], [{ label: "unidade", gramWeight: 50 }])[0].status).toBe("PORTION_SAME_NAME_DIFFERENT_GRAMS");
  });
});
