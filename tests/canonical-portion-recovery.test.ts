import { describe, expect, it } from "vitest";
import { compareCaptureToCanonical, normalizeCanonicalPortion, sourceReferenceState } from "../scripts/food-data/canonical-portion-recovery.mjs";

describe("F3.1 canonical portion recovery", () => {
  it("preserves qualifiers and translates display units without changing provenance", () => {
    const portion = normalizeCanonicalPortion({ source: "USDA", sourceFoodId: "1", canonicalFoodId: "usda:1", sourcePortionId: "p1", label: "1 large tablespoon", amount: 1, grams: 15 });
    expect(portion).toMatchObject({ provenance: "CANONICAL_SOURCE_CONFIRMED", displayMeasurePtBr: "colher de sopa grande", qualifier: ["large"], grams: 15 });
  });
  it("requires both semantic measure and exact gram weight", () => {
    const canonical = { measure: "unidade grande", grams: 61 };
    expect(compareCaptureToCanonical({ singular: "unidade grande", grams: 61 }, canonical).status).toBe("CAPTURE_MATCHES_CANONICAL_PORTION");
    expect(compareCaptureToCanonical({ singular: "unidade grande", grams: 60 }, canonical).status).toBe("CAPTURE_DIFFERS_FROM_CANONICAL");
  });
  it("marks unavailable source references instead of backfilling from capture", () => {
    expect(compareCaptureToCanonical({ singular: "unidade", grams: 61 }, null).status).toBe("CAPTURE_PORTION_NOT_VERIFIED");
    expect(sourceReferenceState({ source: "USDA", hasLocalSourceArtifact: false, hasImportedPortions: false, isPartial: true })).toBe("SOURCE_REFERENCE_PARTIAL");
  });
});
