import { describe, expect, it } from "vitest";
import { canAutoResolveCanonicalV2 } from "@/lib/nutrition/canonical-confidence-v2";
import type { ConfidenceFeatures } from "@/lib/nutrition/canonical-confidence-features";

/**
 * FASE 5.5 (item 14) — testes DIRETOS da policy V2, construindo
 * ConfidenceFeatures a mao pra controlar cada sinal com precisao (a
 * mesma abordagem usada pra testar canUseCanonical/classifyMatches nas
 * fases anteriores — a policy e uma funcao pura, testa-la isolada do
 * ranking real e o jeito certo de cobrir cada branch de decisao).
 */

function baseFeatures(overrides: Partial<ConfidenceFeatures> = {}): ConfidenceFeatures {
  return {
    totalScore: 100,
    gapToSecond: 20,
    matchMethod: "EXACT_NAME",
    matchClass: "EXACT_NAME",
    exactName: true,
    aliasExact: false,
    tokenCoverage: 1,
    extraTokenPenalty: 0,
    simplicityScore: 0,
    preparationEvidence: "NONE",
    preparationExact: false,
    preparationConflict: false,
    source: "TACO",
    sourceTieBreakUsed: false,
    classificationGroup: null,
    classificationFoodType: null,
    queryTokenCount: 3,
    candidateTokenCount: 3,
    sourceRichness: 1,
    sourceAgreementCount: 1,
    sourceAgreementStrength: 0,
    numberOfCloseCandidates: 0,
    varietyRequired: false,
    simpleVsCompositeConflict: false,
    presenceOfCultivarSignal: false,
    presenceOfPreparationSignal: false,
    presenceOfBrandSignal: false,
    presenceOfCompositeClassification: false,
    ...overrides,
  };
}

describe("canAutoResolveCanonicalV2 — Fase 5.5 (item 14)", () => {
  it("exact alias com score moderado (menos exigente) auto-resolve", () => {
    const f = baseFeatures({ matchClass: "EXACT_ALIAS", aliasExact: true, totalScore: 85, gapToSecond: 3 });
    expect(canAutoResolveCanonicalV2(f).autoAccept).toBe(true);
  });

  it("exact name com score/gap altos auto-resolve", () => {
    const f = baseFeatures({ matchClass: "EXACT_NAME", totalScore: 100, gapToSecond: 20 });
    expect(canAutoResolveCanonicalV2(f).autoAccept).toBe(true);
  });

  it("query generica de 1 token NUNCA auto-resolve, mesmo com score altíssimo e gap enorme", () => {
    const f = baseFeatures({ matchClass: "GENERIC_SHORT_QUERY", queryTokenCount: 1, totalScore: 150, gapToSecond: 60 });
    const verdict = canAutoResolveCanonicalV2(f);
    expect(verdict.autoAccept).toBe(false);
    expect(verdict.reason).toMatch(/generica/);
  });

  it("variety required (multiplos cultivares plausiveis) bloqueia auto-aceite mesmo com score/gap altos", () => {
    const f = baseFeatures({ matchClass: "EXACT_NAME", totalScore: 100, gapToSecond: 30, varietyRequired: true });
    const verdict = canAutoResolveCanonicalV2(f);
    expect(verdict.autoAccept).toBe(false);
    expect(verdict.reason).toMatch(/variedades/);
  });

  it("preparo pedido sem evidencia exata (TEXT_INFERRED) bloqueia auto-aceite", () => {
    const f = baseFeatures({ matchClass: "EXACT_NAME", totalScore: 100, gapToSecond: 20, presenceOfPreparationSignal: true, preparationEvidence: "TEXT_INFERRED" });
    const verdict = canAutoResolveCanonicalV2(f);
    expect(verdict.autoAccept).toBe(false);
    expect(verdict.reason).toMatch(/TEXT_INFERRED/);
  });

  it("preparo estruturado (STRUCTURED_EXACT) e MAIS forte que so texto inferido — auto-resolve", () => {
    const structured = baseFeatures({
      matchClass: "EXACT_NAME_AND_PREPARATION",
      totalScore: 100,
      gapToSecond: 10,
      presenceOfPreparationSignal: true,
      preparationEvidence: "STRUCTURED_EXACT",
      preparationExact: true,
    });
    expect(canAutoResolveCanonicalV2(structured).autoAccept).toBe(true);

    const inferred = baseFeatures({
      matchClass: "EXACT_NAME",
      totalScore: 100,
      gapToSecond: 10,
      presenceOfPreparationSignal: true,
      preparationEvidence: "TEXT_INFERRED",
    });
    expect(canAutoResolveCanonicalV2(inferred).autoAccept).toBe(false);
  });

  it("query simples vs candidato composto (prato/preparo) bloqueia mesmo com score alto", () => {
    const f = baseFeatures({ matchClass: "EXACT_NAME", totalScore: 100, gapToSecond: 20, simpleVsCompositeConflict: true });
    const verdict = canAutoResolveCanonicalV2(f);
    expect(verdict.autoAccept).toBe(false);
    expect(verdict.reason).toMatch(/composto/);
  });

  it("source agreement alto (varias fontes concordando) nao e obrigatorio pra auto-aceite, mas nao atrapalha um match ja forte", () => {
    const f = baseFeatures({ matchClass: "EXACT_NAME", totalScore: 100, gapToSecond: 20, sourceAgreementCount: 3, sourceAgreementStrength: 1 });
    expect(canAutoResolveCanonicalV2(f).autoAccept).toBe(true);
  });

  it("source agreement NUNCA aparece como um campo de nutriente/valor — so contagem/força, tipos confirmam isolamento", () => {
    const f = baseFeatures({ sourceAgreementCount: 3, sourceAgreementStrength: 0.66 });
    expect(typeof f.sourceAgreementCount).toBe("number");
    expect(typeof f.sourceAgreementStrength).toBe("number");
    expect(f).not.toHaveProperty("mergedNutrients");
    expect(f).not.toHaveProperty("combinedValue");
  });

  it("caso ambiguo (multiplos candidatos proximos) permanece nao-aceito", () => {
    const f = baseFeatures({ matchClass: "STRONG_TOKEN_MATCH", totalScore: 100, gapToSecond: 2, numberOfCloseCandidates: 3 });
    expect(canAutoResolveCanonicalV2(f).autoAccept).toBe(false);
  });

  it("falsa confianca prevenida: FTS/PARTIAL com score/gap suficientes mas risco MEDIUM/HIGH nao auto-resolve", () => {
    const f = baseFeatures({ matchClass: "FTS_PARTIAL", matchMethod: "CONTAINS", totalScore: 120, gapToSecond: 30, numberOfCloseCandidates: 2 });
    const verdict = canAutoResolveCanonicalV2(f);
    expect(verdict.autoAccept).toBe(false);
  });

  it("FTS/PARTIAL exige MUITO mais evidencia que EXACT_NAME pro mesmo score/gap", () => {
    const exact = baseFeatures({ matchClass: "EXACT_NAME", totalScore: 100, gapToSecond: 10 });
    const partial = baseFeatures({ matchClass: "FTS_PARTIAL", matchMethod: "CONTAINS", totalScore: 100, gapToSecond: 10 });
    expect(canAutoResolveCanonicalV2(exact).autoAccept).toBe(true);
    expect(canAutoResolveCanonicalV2(partial).autoAccept).toBe(false);
  });

  it("conflito de preparo (CONFLICT) sempre bloqueia, independente da classe de match", () => {
    const f = baseFeatures({ matchClass: "EXACT_NAME_AND_PREPARATION", totalScore: 150, gapToSecond: 50, preparationConflict: true });
    expect(canAutoResolveCanonicalV2(f).autoAccept).toBe(false);
  });
});
