import { describe, expect, it } from "vitest";
import { aliasProposal, classifyMeasure, portionProposal, proposalId } from "../scripts/food-data/enrichment-review.mjs";

const source = { rawSourceLabel: "TACO, NEPA", sourceFamily: "TACO", sourceClassification: "PUBLIC_DATABASE" };

describe("Nutrium F3 enrichment review", () => {
  it("preserves measure qualifiers and accepts missing edible metadata", () => {
    expect(classifyMeasure({ singular: "unidade grande", grams: 61, ediblePortionPercentage: null })).toMatchObject({ measureKind: "UNIT", qualifiers: ["grande"], grams: 61 });
  });
  it("detects exact and conflicting portions", () => {
    expect(portionProposal({ canonicalFoodId: "taco:1", captureId: "1", source, raw: { singular: "unidade", grams: 61 }, existingPortions: [{ label: "unidade", gramWeight: 61 }] }).status).toBe("PORTION_EXISTING_EXACT");
    expect(portionProposal({ canonicalFoodId: "taco:1", captureId: "1", source, raw: { singular: "unidade", grams: 61 }, existingPortions: [{ label: "unidade", gramWeight: 50 }] }).status).toBe("PORTION_CONFLICT");
  });
  it("never accepts zero grams", () => {
    expect(portionProposal({ canonicalFoodId: "taco:1", captureId: "1", source, raw: { singular: "unidade", grams: 0 }, existingPortions: [] }).status).toBe("PORTION_REJECTED");
  });
  it("dedupes aliases and protects preparation and brands", () => {
    expect(aliasProposal({ canonicalFoodId: "taco:1", captureId: "1", captureName: "Banana-prata", canonicalName: "Banana prata", source, preparationMatches: true, existingAliases: [] }).status).toBe("NO_CHANGE");
    expect(aliasProposal({ canonicalFoodId: "taco:1", captureId: "1", captureName: "Ovo frito", canonicalName: "Ovo cozido", source, preparationMatches: false, existingAliases: [] }).status).toBe("REVIEW_REQUIRED");
    expect(aliasProposal({ canonicalFoodId: "taco:1", captureId: "1", captureName: "Queijo Atilatte", canonicalName: "Queijo minas", source: { ...source, sourceClassification: "BRAND" }, preparationMatches: true, existingAliases: [] }).status).toBe("REJECTED");
  });
  it("derives proposal ids deterministically", () => {
    const input = { canonicalFoodId: "taco:1", captureId: "1", type: "ALIAS", proposedValue: "banana prata" };
    expect(proposalId(input)).toBe(proposalId(input));
  });
});
