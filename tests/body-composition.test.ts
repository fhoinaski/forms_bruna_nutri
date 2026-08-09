import { describe, expect, it } from "vitest";
import {
  bodyFatPercentageFromDensitySiri,
  calculateBodyComposition,
  calculateBodyDensityJacksonPollock7,
  fatMassKg,
  leanMassKg,
  sumSkinfoldsMm,
} from "../lib/clinical/body-composition";

const COMPLETE_SKINFOLDS = {
  triceps: 15,
  subscapular: 14,
  chest: 12,
  midaxillary: 13,
  suprailiac: 16,
  abdominal: 18,
  thigh: 12,
};

describe("sumSkinfoldsMm", () => {
  it("sums the 7 sites", () => {
    expect(sumSkinfoldsMm(COMPLETE_SKINFOLDS)).toBe(100);
  });

  it("returns null when any site is missing", () => {
    const { thigh, ...rest } = COMPLETE_SKINFOLDS;
    expect(sumSkinfoldsMm(rest)).toBeNull();
    expect(thigh).toBe(12);
  });

  it("returns null when a site is zero or negative", () => {
    expect(sumSkinfoldsMm({ ...COMPLETE_SKINFOLDS, chest: 0 })).toBeNull();
  });
});

describe("calculateBodyDensityJacksonPollock7 + Siri", () => {
  it("computes a plausible body fat percentage for a young man (documented JP7 example)", () => {
    // Soma de dobras = 100mm, 20 anos, homem — referência clássica do
    // protocolo JP7 usada em material de avaliação nutricional/esportiva.
    const density = calculateBodyDensityJacksonPollock7(100, 20, "Masculino");
    const bodyFat = bodyFatPercentageFromDensitySiri(density);
    expect(bodyFat).toBeGreaterThan(10);
    expect(bodyFat).toBeLessThan(16);
  });

  it("computes a plausible body fat percentage for a young woman", () => {
    const density = calculateBodyDensityJacksonPollock7(100, 20, "Feminino");
    const bodyFat = bodyFatPercentageFromDensitySiri(density);
    expect(bodyFat).toBeGreaterThan(15);
    expect(bodyFat).toBeLessThan(25);
  });

  it("produces a higher body density (lower body fat) for less skinfold thickness", () => {
    const lean = calculateBodyDensityJacksonPollock7(60, 25, "Masculino");
    const fatter = calculateBodyDensityJacksonPollock7(160, 25, "Masculino");
    expect(lean).toBeGreaterThan(fatter);
    expect(bodyFatPercentageFromDensitySiri(lean)).toBeLessThan(
      bodyFatPercentageFromDensitySiri(fatter)
    );
  });
});

describe("fatMassKg / leanMassKg", () => {
  it("splits total weight into fat mass and lean mass that add back up", () => {
    const weight = 80;
    const bodyFat = 20;
    const fat = fatMassKg(weight, bodyFat);
    const lean = leanMassKg(weight, fat);
    expect(fat).toBeCloseTo(16, 5);
    expect(lean).toBeCloseTo(64, 5);
    expect(fat + lean).toBeCloseTo(weight, 5);
  });
});

describe("calculateBodyComposition", () => {
  const baseInput = {
    weightKg: 80,
    ageYears: 30,
    sex: "Masculino" as const,
    skinfolds: COMPLETE_SKINFOLDS,
  };

  it("returns a full result when all inputs are present", () => {
    const result = calculateBodyComposition(baseInput);
    expect(result).not.toBeNull();
    expect(result?.sumSkinfoldsMm).toBe(100);
    expect(result?.fatMassKg).toBeGreaterThan(0);
    expect(result?.leanMassKg).toBeGreaterThan(0);
    expect((result?.fatMassKg ?? 0) + (result?.leanMassKg ?? 0)).toBeCloseTo(80, 5);
  });

  it("returns null when weight is missing", () => {
    expect(calculateBodyComposition({ ...baseInput, weightKg: null })).toBeNull();
  });

  it("returns null when age is missing", () => {
    expect(calculateBodyComposition({ ...baseInput, ageYears: undefined })).toBeNull();
  });

  it("returns null when sex is not Masculino/Feminino", () => {
    expect(calculateBodyComposition({ ...baseInput, sex: "Intersexo" })).toBeNull();
    expect(calculateBodyComposition({ ...baseInput, sex: null })).toBeNull();
  });

  it("returns null when a skinfold site is missing", () => {
    const { chest, ...incomplete } = COMPLETE_SKINFOLDS;
    expect(calculateBodyComposition({ ...baseInput, skinfolds: incomplete })).toBeNull();
    expect(chest).toBe(12);
  });
});
