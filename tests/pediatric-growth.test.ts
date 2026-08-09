import { describe, expect, it } from "vitest";
import {
  calculateZScore,
  getMedianValue,
} from "../lib/clinical/pediatric-growth";

describe("WHO pediatric growth references", () => {
  it("calculates z-score zero at the median newborn weight", () => {
    expect(calculateZScore(3.2322, 0, "meninas", "peso_por_idade")).toBeCloseTo(0, 2);
    expect(calculateZScore(3.3464, 0, "meninos", "peso_por_idade")).toBeCloseTo(0, 2);
  });

  it("uses 5-19 year height references by month", () => {
    const median = getMedianValue(120, "meninas", "estatura_por_idade");

    expect(median).toBeCloseTo(138.6, 1);
    expect(calculateZScore(138.6363, 120, "meninas", "estatura_por_idade")).toBeCloseTo(0, 2);
  });

  it("uses 5-19 year BMI references through 19 years", () => {
    const median = getMedianValue(228, "meninos", "imc_por_idade");

    expect(median).toBeCloseTo(22.2, 1);
    expect(calculateZScore(median ?? 0, 228, "meninos", "imc_por_idade")).toBeCloseTo(0, 2);
  });
});
