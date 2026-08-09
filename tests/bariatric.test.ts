import { describe, expect, it } from "vitest";
import {
  calculateBariatricProgress,
  calculatePercentExcessWeightLoss,
  calculatePercentTotalWeightLoss,
} from "../lib/clinical/bariatric";

describe("calculatePercentTotalWeightLoss", () => {
  it("calculates %TWL correctly", () => {
    // 120kg pre-cirurgia, 90kg atual -> perdeu 30kg, 25% do peso total.
    expect(calculatePercentTotalWeightLoss(120, 90)).toBeCloseTo(25, 5);
  });

  it("returns null for invalid weights", () => {
    expect(calculatePercentTotalWeightLoss(0, 90)).toBeNull();
    expect(calculatePercentTotalWeightLoss(120, -1)).toBeNull();
    expect(calculatePercentTotalWeightLoss(NaN, 90)).toBeNull();
  });
});

describe("calculatePercentExcessWeightLoss", () => {
  it("calculates %EWL correctly", () => {
    // 120kg pre-cirurgia, meta 70kg (excesso de 50kg), atual 90kg
    // -> perdeu 30kg dos 50kg de excesso = 60%.
    expect(calculatePercentExcessWeightLoss(120, 70, 90)).toBeCloseTo(60, 5);
  });

  it("returns null when there is no excess weight to lose", () => {
    expect(calculatePercentExcessWeightLoss(70, 70, 65)).toBeNull();
    expect(calculatePercentExcessWeightLoss(70, 80, 65)).toBeNull();
  });

  it("returns null for invalid inputs", () => {
    expect(calculatePercentExcessWeightLoss(120, 0, 90)).toBeNull();
  });
});

describe("calculateBariatricProgress", () => {
  it("returns full progress when pre-surgery, ideal and current weight are present", () => {
    const result = calculateBariatricProgress({ preSurgeryWeightKg: 120, idealWeightKg: 70, currentWeightKg: 90 });
    expect(result).not.toBeNull();
    expect(result?.weightLostKg).toBeCloseTo(30, 5);
    expect(result?.percentTotalWeightLoss).toBeCloseTo(25, 5);
    expect(result?.percentExcessWeightLoss).toBeCloseTo(60, 5);
  });

  it("returns %TWL with null %EWL when ideal weight is missing", () => {
    const result = calculateBariatricProgress({ preSurgeryWeightKg: 120, idealWeightKg: null, currentWeightKg: 90 });
    expect(result).not.toBeNull();
    expect(result?.percentTotalWeightLoss).toBeCloseTo(25, 5);
    expect(result?.percentExcessWeightLoss).toBeNull();
  });

  it("returns null when pre-surgery or current weight is missing", () => {
    expect(calculateBariatricProgress({ preSurgeryWeightKg: null, idealWeightKg: 70, currentWeightKg: 90 })).toBeNull();
    expect(calculateBariatricProgress({ preSurgeryWeightKg: 120, idealWeightKg: 70, currentWeightKg: null })).toBeNull();
  });
});
