import { describe, expect, it } from "vitest";
import {
  calculateBmiValue,
  calculateWeightDelta,
  classifyAdultBmi,
  formatClinicalNumber,
  parseMeasurement,
} from "../lib/clinical/anthropometry";

describe("clinical anthropometry helpers", () => {
  it("parses Brazilian decimal measurements", () => {
    expect(parseMeasurement("68,5 kg")).toBe(68.5);
    expect(parseMeasurement("165 cm")).toBe(165);
    expect(parseMeasurement("")).toBeNull();
  });

  it("calculates and classifies adult BMI", () => {
    const bmi = calculateBmiValue("68,5", "165");
    expect(bmi).toBe(25.2);
    expect(formatClinicalNumber(bmi)).toBe("25,2");
    expect(classifyAdultBmi(bmi)).toBe("Sobrepeso");
  });

  it("calculates longitudinal weight delta", () => {
    expect(calculateWeightDelta(67.2, 68.5)).toBe(-1.3);
    expect(calculateWeightDelta(null, 68.5)).toBeNull();
  });
});
