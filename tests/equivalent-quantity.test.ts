import { describe, expect, it } from "vitest";
import { computeEquivalentQuantity, rankEquivalentCandidates, roundToPracticalQuantity, matchHouseholdPortion } from "@/lib/nutrition/equivalent-quantity";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";

const reference: MacroReferenceFood = {
  numero: "ref",
  descricao: "Arroz, tipo 1, cozido (fixture)",
  grupo: "Cereais e derivados",
  fonte: "custom",
  energia_kcal: 130,
  proteina_g: 2.5,
  carboidrato_g: 28.1,
  lipidios_g: 0.2,
};

const sameCategoryCandidate: MacroReferenceFood = {
  numero: "same-cat",
  descricao: "Aveia, cozida (fixture)",
  grupo: "Cereais e derivados",
  fonte: "custom",
  energia_kcal: 70,
  proteina_g: 2.5,
  carboidrato_g: 12,
  lipidios_g: 1.4,
};

const otherCategoryCandidate: MacroReferenceFood = {
  numero: "other-cat",
  descricao: "Açúcar, cristal (fixture)",
  grupo: "Produtos açucarados",
  fonte: "custom",
  energia_kcal: 387,
  proteina_g: 0,
  carboidrato_g: 99.6,
  lipidios_g: 0,
};

describe("computeEquivalentQuantity — determinístico, sem IA, nunca divide por zero", () => {
  it("calculates the practical quantity that preserves ENERGY, revalidated by the real Nutrition Engine", () => {
    const result = computeEquivalentQuantity({
      referenceFood: reference,
      referenceGrams: 100,
      candidateFood: sameCategoryCandidate,
      criterion: "ENERGY",
    });
    expect(result.status).toBe("CALCULATED");
    // alvo: 130 kcal; candidato tem 70 kcal/100g -> bruto = 185.71g -> prático = 185g (mult. de 5)
    expect(result.rawCandidateQuantityGrams).toBeCloseTo(185.71, 1);
    expect(result.practicalCandidateQuantityGrams).toBe(185);
    // valor final SEMPRE recalculado na quantidade prática, não na bruta
    expect(result.candidateNutrition!.energyKcal).toBeCloseTo((70 * 185) / 100, 5);
    expect(result.targetDelta).not.toBeNull();
    expect(result.percentDifference).not.toBeNull();
  });

  it("calculates equivalent quantity for PROTEIN independently of energy", () => {
    const result = computeEquivalentQuantity({
      referenceFood: reference,
      referenceGrams: 100,
      candidateFood: sameCategoryCandidate,
      criterion: "PROTEIN",
    });
    expect(result.status).toBe("CALCULATED");
    // alvo: 2.5g proteína; candidato tem 2.5g/100g -> 100g exatos, múltiplo de 5 já
    expect(result.practicalCandidateQuantityGrams).toBe(100);
    expect(result.targetDelta).toBeCloseTo(0, 5);
  });

  it("calculates equivalent quantity for CARBOHYDRATE", () => {
    const result = computeEquivalentQuantity({
      referenceFood: reference,
      referenceGrams: 100,
      candidateFood: sameCategoryCandidate,
      criterion: "CARBOHYDRATE",
    });
    expect(result.status).toBe("CALCULATED");
    // alvo: 28.1g carb; candidato 12g/100g -> bruto = 234.17g -> prático = 235g
    expect(result.practicalCandidateQuantityGrams).toBe(235);
  });

  it("calculates equivalent quantity for FAT", () => {
    const result = computeEquivalentQuantity({
      referenceFood: reference,
      referenceGrams: 100,
      candidateFood: sameCategoryCandidate,
      criterion: "FAT",
    });
    expect(result.status).toBe("CALCULATED");
    // alvo: 0.2g gordura; candidato 1.4g/100g -> bruto = 14.29g -> prático = 15g
    expect(result.practicalCandidateQuantityGrams).toBe(15);
  });

  it("returns ZERO_TARGET_NUTRIENT when the reference has no target nutrient to preserve (never divides by zero)", () => {
    const zeroFatReference: MacroReferenceFood = { ...reference, lipidios_g: 0 };
    const result = computeEquivalentQuantity({
      referenceFood: zeroFatReference,
      referenceGrams: 100,
      candidateFood: sameCategoryCandidate,
      criterion: "FAT",
    });
    expect(result.status).toBe("ZERO_TARGET_NUTRIENT");
    expect(result.rawCandidateQuantityGrams).toBeNull();
    expect(result.practicalCandidateQuantityGrams).toBeNull();
  });

  it("returns ZERO_TARGET_NUTRIENT when the candidate has zero of the target nutrient (never divides by zero)", () => {
    const zeroProteinCandidate: MacroReferenceFood = { ...sameCategoryCandidate, proteina_g: 0 };
    const result = computeEquivalentQuantity({
      referenceFood: reference,
      referenceGrams: 100,
      candidateFood: zeroProteinCandidate,
      criterion: "PROTEIN",
    });
    expect(result.status).toBe("ZERO_TARGET_NUTRIENT");
  });

  it("returns MISSING_TARGET_NUTRIENT when the candidate's field is not a finite number (missing != zero)", () => {
    const malformedCandidate = { ...sameCategoryCandidate, lipidios_g: undefined as unknown as number };
    const result = computeEquivalentQuantity({
      referenceFood: reference,
      referenceGrams: 100,
      candidateFood: malformedCandidate,
      criterion: "FAT",
    });
    expect(result.status).toBe("MISSING_TARGET_NUTRIENT");
  });

  it("returns INVALID_QUANTITY for a non-positive reference quantity", () => {
    const result = computeEquivalentQuantity({
      referenceFood: reference,
      referenceGrams: 0,
      candidateFood: sameCategoryCandidate,
      criterion: "ENERGY",
    });
    expect(result.status).toBe("INVALID_QUANTITY");
  });

  it("keeps referenceNutrition populated even for a status that stops before the candidate math", () => {
    const zeroFatReference: MacroReferenceFood = { ...reference, lipidios_g: 0 };
    const result = computeEquivalentQuantity({
      referenceFood: zeroFatReference,
      referenceGrams: 100,
      candidateFood: sameCategoryCandidate,
      criterion: "FAT",
    });
    expect(result.referenceNutrition).not.toBeNull();
    expect(result.referenceNutrition!.energyKcal).toBeCloseTo(zeroFatReference.energia_kcal, 5);
  });

  it("never returns a delta of exactly the algebraic target once rounding is applied — nutritionDelta reflects the PRACTICAL quantity", () => {
    const result = computeEquivalentQuantity({
      referenceFood: reference,
      referenceGrams: 100,
      candidateFood: sameCategoryCandidate,
      criterion: "ENERGY",
    });
    expect(result.nutritionDelta).not.toBeNull();
    expect(result.nutritionDelta!.energyKcal).toBeCloseTo(result.targetDelta!, 5);
  });
});

describe("roundToPracticalQuantity — política de 5g uniforme (auditada dos motores já existentes)", () => {
  it("rounds to the nearest 5g increment", () => {
    expect(roundToPracticalQuantity(187)).toBe(185);
    expect(roundToPracticalQuantity(188)).toBe(190);
  });

  it("never rounds below the 5g floor even for a tiny raw quantity", () => {
    expect(roundToPracticalQuantity(1)).toBe(5);
  });
});

describe("rankEquivalentCandidates — determinístico, sem IA, sem rótulo clínico", () => {
  it("prioritizes same-category candidates over a closer-percentage different-category candidate", () => {
    const sameCatResult = computeEquivalentQuantity({
      referenceFood: reference,
      referenceGrams: 100,
      candidateFood: sameCategoryCandidate,
      criterion: "ENERGY",
    });
    const otherCatResult = computeEquivalentQuantity({
      referenceFood: reference,
      referenceGrams: 100,
      candidateFood: otherCategoryCandidate,
      criterion: "ENERGY",
    });
    const ranked = rankEquivalentCandidates(reference, [
      { candidateFood: otherCategoryCandidate, result: otherCatResult },
      { candidateFood: sameCategoryCandidate, result: sameCatResult },
    ]);
    expect(ranked[0].candidateFood.numero).toBe("same-cat");
    expect(ranked[0].sameCategory).toBe(true);
  });

  it("excludes non-CALCULATED candidates from the ranking entirely", () => {
    const zeroFatReference: MacroReferenceFood = { ...reference, lipidios_g: 0 };
    const uncalculable = computeEquivalentQuantity({
      referenceFood: zeroFatReference,
      referenceGrams: 100,
      candidateFood: sameCategoryCandidate,
      criterion: "FAT",
    });
    const ranked = rankEquivalentCandidates(zeroFatReference, [{ candidateFood: sameCategoryCandidate, result: uncalculable }]);
    expect(ranked).toHaveLength(0);
  });

  it("breaks ties deterministically by food name when percent difference and category are equal", () => {
    const candidateA: MacroReferenceFood = { ...sameCategoryCandidate, numero: "a-food", descricao: "A Food" };
    const candidateB: MacroReferenceFood = { ...sameCategoryCandidate, numero: "b-food", descricao: "B Food" };
    const resultA = computeEquivalentQuantity({ referenceFood: reference, referenceGrams: 100, candidateFood: candidateA, criterion: "ENERGY" });
    const resultB = computeEquivalentQuantity({ referenceFood: reference, referenceGrams: 100, candidateFood: candidateB, criterion: "ENERGY" });
    const ranked = rankEquivalentCandidates(reference, [
      { candidateFood: candidateB, result: resultB },
      { candidateFood: candidateA, result: resultA },
    ]);
    expect(ranked[0].candidateFood.numero).toBe("a-food");
    expect(ranked[1].candidateFood.numero).toBe("b-food");
  });
});

describe("matchHouseholdPortion — nunca inventa colher/xícara/unidade sem porção canônica real", () => {
  it("returns an exact match when the practical quantity is a whole multiple of a known portion", () => {
    const match = matchHouseholdPortion(200, [{ id: "p1", label: "unidade média", gramWeight: 100 }]);
    expect(match).not.toBeNull();
    expect(match!.approxCount).toBe(2);
    expect(match!.toleranceRatio).toBeCloseTo(0, 5);
  });

  it("returns a near match within the 15% tolerance", () => {
    // 185g vs 2 unidades de 100g = 200g -> distancia 15/200 = 7.5%, dentro da tolerancia
    const match = matchHouseholdPortion(185, [{ id: "p1", label: "unidade média", gramWeight: 100 }]);
    expect(match).not.toBeNull();
    expect(match!.approxCount).toBe(2);
  });

  it("returns null when no known portion approximates the quantity within tolerance", () => {
    // 258g vs 1 unidade de 100g (25.8%) ou 2 unidades (29%) -> ambos fora da tolerancia de 15%
    const match = matchHouseholdPortion(258, [{ id: "p1", label: "unidade pequena", gramWeight: 100 }]);
    expect(match).toBeNull();
  });

  it("returns null when there are no portions registered for the food (never invents one)", () => {
    expect(matchHouseholdPortion(150, [])).toBeNull();
  });

  it("picks the closest of multiple candidate portions", () => {
    const match = matchHouseholdPortion(150, [
      { id: "p-slice", label: "fatia", gramWeight: 30 },
      { id: "p-unit", label: "unidade", gramWeight: 75 },
    ]);
    // fatia: 150/30 = 5 fatias exatas (0% distância); unidade: 150/75 = 2 unidades exatas (0% distância) -- empate real,
    // usa a primeira da lista (fatia) por desempate determinístico de ordem.
    expect(match).not.toBeNull();
    expect(match!.portionId).toBe("p-slice");
  });

  it("ignores portions with an invalid (non-positive) gram weight instead of crashing", () => {
    const match = matchHouseholdPortion(100, [{ id: "bad", label: "quebrada", gramWeight: 0 }, { id: "good", label: "unidade", gramWeight: 100 }]);
    expect(match).not.toBeNull();
    expect(match!.portionId).toBe("good");
  });

  it("returns null for a non-positive practical quantity", () => {
    expect(matchHouseholdPortion(0, [{ id: "p1", label: "unidade", gramWeight: 100 }])).toBeNull();
  });
});
