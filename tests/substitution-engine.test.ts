import { describe, expect, it } from "vitest";
import {
  findFoodSubstitutes,
  computeEquivalenceScore,
  classifyFoodRole,
  DEFAULT_SUBSTITUTION_WEIGHTS_BY_ROLE,
  DEFAULT_SUBSTITUTION_TOLERANCES,
} from "@/lib/nutrition/substitution-engine";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";

/**
 * Substitution Engine — determinístico, nunca chama IA, sempre revalida
 * pela engine oficial (calculateItemNutrients) depois de arredondar.
 */

const arroz = TACO_REFERENCES.find((f) => /^Arroz, tipo 1, cozido$/i.test(f.descricao) || (/arroz/i.test(f.descricao) && (f.carboidrato_g ?? 0) > 20 && (f.proteina_g ?? 0) < 5))!;
const batata = TACO_REFERENCES.find((f) => /batata,?\s*inglesa,?\s*cozida/i.test(f.descricao))!;
const carbDense = TACO_REFERENCES.find((f) => typeof f.numero === "number" && (f.carboidrato_g ?? 0) > 60 && (f.proteina_g ?? 0) < 10 && f !== arroz)!;
const proteinDense = TACO_REFERENCES.find((f) => typeof f.numero === "number" && (f.proteina_g ?? 0) > 20 && (f.lipidios_g ?? 0) < 12 && (f.carboidrato_g ?? 0) < 5)!;
const proteinDense2 = TACO_REFERENCES.filter((f) => typeof f.numero === "number" && (f.proteina_g ?? 0) > 15 && (f.lipidios_g ?? 0) < 15 && (f.carboidrato_g ?? 0) < 5 && f !== proteinDense)[0]!;
const pureFatFoods = TACO_REFERENCES.filter((f) => typeof f.numero === "number" && (f.lipidios_g ?? 0) > 70 && (f.carboidrato_g ?? 0) < 5 && (f.proteina_g ?? 0) < 5);
const fatDense = pureFatFoods[0]!;
const fatDense2 = pureFatFoods[1]!;

describe("classifyFoodRole — classificação técnica, nunca clínica", () => {
  it("classifica alimento denso em carboidrato", () => {
    expect(classifyFoodRole(carbDense)).toBe("carbohydrate");
  });
  it("classifica alimento denso em proteína", () => {
    expect(classifyFoodRole(proteinDense)).toBe("protein");
  });
  it("classifica alimento denso em gordura", () => {
    expect(classifyFoodRole(fatDense)).toBe("fat");
  });
});

describe("computeEquivalenceScore — NULL nunca vira 0, nutriente desconhecido é excluído", () => {
  it("nutriente ausente em um dos lados não entra no score (não vira erro artificial)", () => {
    const base = { energyKcal: 100, proteinG: 5, carbohydrateG: 20, fatG: 2, fiberG: null };
    const candidate = { energyKcal: 100, proteinG: 5, carbohydrateG: 20, fatG: 2, fiberG: 3 };
    const result = computeEquivalenceScore(base, candidate, DEFAULT_SUBSTITUTION_WEIGHTS_BY_ROLE.mixed, DEFAULT_SUBSTITUTION_TOLERANCES);
    expect(result.consideredNutrients).not.toContain("fiber");
    expect(result.score).toBe(0); // os 4 nutrientes comparáveis batem exatamente
  });

  it("base zero e candidato zero no mesmo eixo → erro 0 (equivalência perfeita), não divisão por zero", () => {
    const base = { energyKcal: 100, proteinG: 0, carbohydrateG: 20, fatG: 2, fiberG: null };
    const candidate = { energyKcal: 100, proteinG: 0, carbohydrateG: 20, fatG: 2, fiberG: null };
    const result = computeEquivalenceScore(base, candidate, DEFAULT_SUBSTITUTION_WEIGHTS_BY_ROLE.mixed, DEFAULT_SUBSTITUTION_TOLERANCES);
    expect(result.errorsByNutrient.protein).toBe(0);
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it("base zero e candidato não-zero → nutriente excluído do score (nunca aproximado por divisão por zero)", () => {
    const base = { energyKcal: 100, proteinG: 0, carbohydrateG: 20, fatG: 2, fiberG: null };
    const candidate = { energyKcal: 100, proteinG: 5, carbohydrateG: 20, fatG: 2, fiberG: null };
    const result = computeEquivalenceScore(base, candidate, DEFAULT_SUBSTITUTION_WEIGHTS_BY_ROLE.mixed, DEFAULT_SUBSTITUTION_TOLERANCES);
    expect(result.consideredNutrients).not.toContain("protein");
  });

  it("nenhum nutriente comparável → score infinito, quality UNSUITABLE (nunca finge equivalência)", () => {
    const base = { energyKcal: null, proteinG: null, carbohydrateG: null, fatG: null, fiberG: null };
    const candidate = { energyKcal: 100, proteinG: 5, carbohydrateG: 20, fatG: 2, fiberG: 3 };
    const result = computeEquivalenceScore(base, candidate, DEFAULT_SUBSTITUTION_WEIGHTS_BY_ROLE.mixed, DEFAULT_SUBSTITUTION_TOLERANCES);
    expect(result.score).toBe(Number.POSITIVE_INFINITY);
    expect(result.quality).toBe("UNSUITABLE");
  });
});

describe("findFoodSubstitutes — modo energy (arroz → batata)", () => {
  it("encontra quantidade equivalente energeticamente, revalidada pela engine, arredondada em múltiplos de 5g", () => {
    const results = findFoodSubstitutes({ baseFood: arroz, baseGrams: 100, candidates: [batata, carbDense], mode: "energy" });
    expect(results.length).toBeGreaterThan(0);
    const batataResult = results.find((r) => r.food === batata);
    expect(batataResult).toBeDefined();
    expect(batataResult!.quantityGrams % 5).toBe(0);
    // Energia deve ficar dentro (ou muito próxima) da tolerância padrão de 5%.
    const baseEnergy = (arroz.energia_kcal * 100) / 100;
    expect(Math.abs(batataResult!.nutrition.energyKcal! - baseEnergy) / baseEnergy).toBeLessThanOrEqual(0.06);
  });
});

describe("findFoodSubstitutes — modo nutritional (carboidrato → outro carboidrato)", () => {
  it("prioriza carboidrato+energia para um alimento denso em carboidrato, quality não é UNSUITABLE quando plausível", () => {
    const results = findFoodSubstitutes({ baseFood: carbDense, baseGrams: 100, candidates: TACO_REFERENCES.slice(0, 200), mode: "nutritional" });
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.quality).not.toBe("UNSUITABLE");
      expect(result.quantityGrams % 5).toBe(0);
    }
  });
});

describe("findFoodSubstitutes — proteína → proteína", () => {
  it("candidato proteico é priorizado quando o alimento-base é denso em proteína", () => {
    const results = findFoodSubstitutes({ baseFood: proteinDense, baseGrams: 100, candidates: [proteinDense2, carbDense], mode: "nutritional" });
    const proteinResult = results.find((r) => r.food === proteinDense2);
    const carbResult = results.find((r) => r.food === carbDense);
    expect(proteinResult).toBeDefined();
    if (carbResult) expect(proteinResult!.score).toBeLessThanOrEqual(carbResult.score);
  });
});

describe("findFoodSubstitutes — gordura → gordura", () => {
  it("candidato lipídico é priorizado quando o alimento-base é denso em gordura", () => {
    const results = findFoodSubstitutes({ baseFood: fatDense, baseGrams: 20, candidates: [fatDense2, carbDense], mode: "nutritional" });
    const fatResult = results.find((r) => r.food === fatDense2);
    expect(fatResult).toBeDefined();
    expect(fatResult!.quality).not.toBe("UNSUITABLE");
  });
});

describe("findFoodSubstitutes — tolerância", () => {
  it("candidato claramente fora de qualquer tolerância plausível nunca aparece no resultado", () => {
    const tinyEnergyFood: MacroReferenceFood = { numero: 99901, descricao: "Alimento teste baixíssima energia", fonte: "custom", energia_kcal: 1, proteina_g: 0.1, carboidrato_g: 0.2, lipidios_g: 0 };
    const results = findFoodSubstitutes({ baseFood: carbDense, baseGrams: 100, candidates: [tinyEnergyFood], mode: "nutritional" });
    expect(results.find((r) => r.food === tinyEnergyFood)).toBeUndefined();
  });
});

describe("findFoodSubstitutes — arredondamento e recálculo pela engine", () => {
  it("nunca retorna gramatura com casas decimais longas", () => {
    const results = findFoodSubstitutes({ baseFood: carbDense, baseGrams: 137, candidates: TACO_REFERENCES.slice(0, 100), mode: "nutritional" });
    for (const result of results) {
      expect(Number.isInteger(result.quantityGrams)).toBe(true);
      expect(result.quantityGrams % 5).toBe(0);
    }
  });

  it("valores nutricionais retornados batem com calculateItemNutrients na mesma quantidade (nunca a fórmula algébrica bruta)", async () => {
    const { calculateItemNutrients } = await import("@/lib/nutrition/nutrients");
    const results = findFoodSubstitutes({ baseFood: arroz, baseGrams: 100, candidates: [batata], mode: "energy" });
    const batataResult = results.find((r) => r.food === batata)!;
    const direct = calculateItemNutrients(String(batataResult.quantityGrams), "g", batata);
    expect(batataResult.nutrition.energyKcal).toBeCloseTo(direct.values.energyKcal!, 6);
    expect(batataResult.nutrition.proteinG).toBeCloseTo(direct.values.proteinG!, 6);
  });
});

describe("findFoodSubstitutes — nunca sugere o mesmo alimento como substituto de si mesmo", () => {
  it("filtra o próprio alimento-base da lista de candidatos", () => {
    const results = findFoodSubstitutes({ baseFood: arroz, baseGrams: 100, candidates: [arroz, batata], mode: "energy" });
    expect(results.find((r) => r.food === arroz)).toBeUndefined();
  });
});

describe("findFoodSubstitutes — quantidade base inválida", () => {
  it("baseGrams <= 0 nunca produz resultado (não inventa uma base)", () => {
    expect(findFoodSubstitutes({ baseFood: arroz, baseGrams: 0, candidates: [batata], mode: "energy" })).toHaveLength(0);
    expect(findFoodSubstitutes({ baseFood: arroz, baseGrams: -10, candidates: [batata], mode: "nutritional" })).toHaveLength(0);
  });
});
