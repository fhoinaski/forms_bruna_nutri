import { describe, expect, it } from "vitest";
import { compareTargetVsPrescribed } from "@/lib/nutrition/targets";
import type { NutrientValues } from "@/lib/nutrition/nutrients";

const prescribed: NutrientValues = {
  energyKcal: 1876,
  proteinG: 128,
  carbohydrateG: 204,
  fatG: 61,
  fiberG: 27,
  sodiumMg: 1800,
  calciumMg: null,
  ironMg: 12,
  potassiumMg: null,
  vitaminCMg: 80,
};

describe("compareTargetVsPrescribed", () => {
  it("only compares nutrients that have a target defined (nunca usa IA, so aritmetica)", () => {
    const rows = compareTargetVsPrescribed({ energyKcal: 1900 }, prescribed);
    expect(rows).toHaveLength(1);
    expect(rows[0].nutrient).toBe("energyKcal");
    expect(rows[0].target).toBe(1900);
    expect(rows[0].prescribed).toBe(1876);
    expect(rows[0].diff).toBeCloseTo(-24, 5);
    expect(rows[0].percentOfTarget).toBeCloseTo(98.7, 1);
  });

  it("computes diff and percent for all 4 core macros when targets are set", () => {
    const rows = compareTargetVsPrescribed(
      { energyKcal: 1900, proteinG: 130, carbohydrateG: 210, fatG: 60 },
      prescribed
    );
    expect(rows).toHaveLength(4);
    const protein = rows.find((row) => row.nutrient === "proteinG")!;
    expect(protein.diff).toBeCloseTo(-2, 5);
    const fat = rows.find((row) => row.nutrient === "fatG")!;
    expect(fat.diff).toBeCloseTo(1, 5);
  });

  it("returns prescribed=null and percent=null when the plan has no data for that nutrient", () => {
    const rows = compareTargetVsPrescribed({ energyKcal: 1900 }, { ...prescribed, energyKcal: null });
    expect(rows[0].prescribed).toBeNull();
    expect(rows[0].diff).toBeNull();
    expect(rows[0].percentOfTarget).toBeNull();
  });

  it("returns an empty list when no target is defined at all", () => {
    expect(compareTargetVsPrescribed({}, prescribed)).toEqual([]);
  });
});
