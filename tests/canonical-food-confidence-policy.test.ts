import { describe, expect, it } from "vitest";
import { canUseCanonical, CANONICAL_CONFIDENCE_GAP_THRESHOLD, CANONICAL_CONFIDENCE_SCORE_THRESHOLD } from "@/lib/nutrition/canonical-food-shadow";

/**
 * FASE 4 (item 8) — policy de confianca documentada e testada, NUNCA
 * ativada como substituicao automatica de dado nesta fase (so decide se
 * prefer_canonical tenta re-resolver via o resolver atual).
 */
describe("canUseCanonical — confidence policy", () => {
  it("exige status EXACT ou RESOLVED — AMBIGUOUS/PREPARATION_REVIEW/NOT_FOUND nunca sao usaveis", () => {
    for (const status of ["AMBIGUOUS", "PREPARATION_REVIEW", "NOT_FOUND"] as const) {
      expect(canUseCanonical({ status, score: 999, gapToSecond: null, preparationConflict: false })).toBe(false);
    }
    expect(canUseCanonical({ status: "EXACT", score: 999, gapToSecond: null, preparationConflict: false })).toBe(true);
    expect(canUseCanonical({ status: "RESOLVED", score: 999, gapToSecond: null, preparationConflict: false })).toBe(true);
  });

  it("exige score >= limiar", () => {
    expect(canUseCanonical({ status: "EXACT", score: CANONICAL_CONFIDENCE_SCORE_THRESHOLD - 1, gapToSecond: null, preparationConflict: false })).toBe(false);
    expect(canUseCanonical({ status: "EXACT", score: CANONICAL_CONFIDENCE_SCORE_THRESHOLD, gapToSecond: null, preparationConflict: false })).toBe(true);
  });

  it("exige gap ao segundo candidato >= limiar quando ha um segundo candidato", () => {
    expect(canUseCanonical({ status: "EXACT", score: 100, gapToSecond: CANONICAL_CONFIDENCE_GAP_THRESHOLD - 1, preparationConflict: false })).toBe(false);
    expect(canUseCanonical({ status: "EXACT", score: 100, gapToSecond: CANONICAL_CONFIDENCE_GAP_THRESHOLD, preparationConflict: false })).toBe(true);
  });

  it("gapToSecond null (candidato unico) nunca bloqueia sozinho", () => {
    expect(canUseCanonical({ status: "EXACT", score: 100, gapToSecond: null, preparationConflict: false })).toBe(true);
  });

  it("conflito de preparo sempre bloqueia, mesmo com score/gap perfeitos", () => {
    expect(canUseCanonical({ status: "EXACT", score: 100, gapToSecond: 50, preparationConflict: true })).toBe(false);
  });
});
