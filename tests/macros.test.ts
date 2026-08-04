import { describe, expect, it } from "vitest";
import { estimateFoodMacros, estimateMacrosFromLine, roundedMacros, sumMacros } from "@/lib/nutrition/macros";

describe("live macro estimation", () => {
  it("calculates a known food from grams", () => {
    const result = roundedMacros(estimateFoodMacros("Arroz integral cozido", "100", "g"));
    expect(result.kcal).toBe(128);
    expect(result.carbs).toBe(28.1);
    expect(result.recognizedItems).toBe(1);
  });

  it("parses imported protocol meal lines", () => {
    const result = roundedMacros(estimateMacrosFromLine("Peito de frango - 150 g"));
    expect(result.kcal).toBe(239);
    expect(result.protein).toBe(48);
  });

  it("keeps unrecognized foods visible in coverage totals", () => {
    const result = sumMacros([
      estimateFoodMacros("Banana", "100", "g"),
      estimateFoodMacros("Alimento não catalogado", "100", "g"),
    ]);
    expect(result.totalItems).toBe(2);
    expect(result.recognizedItems).toBe(1);
  });
});
