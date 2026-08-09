import { describe, expect, it } from "vitest";
import {
  classifyPrePregnancyBmi,
  classifyWeeklyGainRate,
  getRecommendedTotalGain,
} from "../lib/clinical/gestational";

describe("gestational weight gain references", () => {
  it("classifies pre-pregnancy BMI into the four IOM categories", () => {
    expect(classifyPrePregnancyBmi(17)?.category).toBe("baixo_peso");
    expect(classifyPrePregnancyBmi(22)?.category).toBe("normal");
    expect(classifyPrePregnancyBmi(27)?.category).toBe("sobrepeso");
    expect(classifyPrePregnancyBmi(32)?.category).toBe("obesidade");
  });

  it("returns recommended total gain for each category", () => {
    expect(getRecommendedTotalGain("baixo_peso")).toMatchObject({ ganho_min_kg: 12.5, ganho_max_kg: 18 });
    expect(getRecommendedTotalGain("normal")).toMatchObject({ ganho_min_kg: 11.5, ganho_max_kg: 16 });
    expect(getRecommendedTotalGain("sobrepeso")).toMatchObject({ ganho_min_kg: 7, ganho_max_kg: 11.5 });
    expect(getRecommendedTotalGain("obesidade")).toMatchObject({ ganho_min_kg: 5, ganho_max_kg: 9 });
  });

  it("classifies weekly gain rates below, inside and above each expected range", () => {
    const cases = [
      ["baixo_peso", 0.48, 0.5, 0.52],
      ["normal", 0.41, 0.45, 0.48],
      ["sobrepeso", 0.28, 0.3, 0.32],
      ["obesidade", 0.22, 0.25, 0.27],
    ] as const;

    for (const [category, below, adequate, above] of cases) {
      expect(classifyWeeklyGainRate(category, below)?.classification).toBe("abaixo");
      expect(classifyWeeklyGainRate(category, adequate)?.classification).toBe("adequado");
      expect(classifyWeeklyGainRate(category, above)?.classification).toBe("acima");
    }
  });
});
