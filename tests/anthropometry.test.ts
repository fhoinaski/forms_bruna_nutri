import { describe, expect, it } from "vitest";
import {
  calculateBmiValue,
  calculateWaistHeightRatio,
  calculateWaistHipRatio,
  calculateWeightDelta,
  classifyAdultBmi,
  classifyWaistHeightRatio,
  classifyWaistHipRatio,
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

  it("calculates and classifies waist-to-hip ratio", () => {
    expect(calculateWaistHipRatio("90", "100")).toBe(0.9);
    expect(calculateWaistHipRatio(null, "100")).toBeNull();
    expect(classifyWaistHipRatio(0.9, "Masculino")).toBe("Risco cardiometabolico aumentado");
    expect(classifyWaistHipRatio(0.89, "Masculino")).toBe("Dentro da faixa de referencia");
    expect(classifyWaistHipRatio(0.85, "Feminino")).toBe("Risco cardiometabolico aumentado");
    expect(classifyWaistHipRatio(0.84, "Feminino")).toBe("Dentro da faixa de referencia");
    expect(classifyWaistHipRatio(0.9, "Intersexo")).toBe("Defina o sexo biologico para classificar o risco");
    expect(classifyWaistHipRatio(null, "Masculino")).toBeNull();
  });

  it("calculates and classifies waist-to-height ratio", () => {
    expect(calculateWaistHeightRatio("90", "180")).toBe(0.5);
    expect(calculateWaistHeightRatio(null, "180")).toBeNull();
    expect(classifyWaistHeightRatio(0.5)).toBe("Risco cardiometabolico aumentado (RCE >= 0,5)");
    expect(classifyWaistHeightRatio(0.49)).toBe("Dentro da faixa de referencia");
    expect(classifyWaistHeightRatio(null)).toBeNull();
  });
});
