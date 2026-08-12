import { describe, expect, it } from "vitest";
import {
  calculateItemNutrients,
  calculatePlanNutrients,
  resolveItemReference,
  roundedNutrients,
  sumNutrients,
  type FoodReferenceLookup,
  type NutrientValues,
} from "@/lib/nutrition/nutrients";
import { getTacoFoodByNumber } from "@/lib/nutrition/taco";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import type { HouseholdMeasureOption } from "@/lib/nutrition/quantity-resolution";

const arroz = getTacoFoodByNumber("3")!; // Arroz, tipo 1, cozido
const banana = getTacoFoodByNumber("179")!; // Banana, nanica, crua

describe("calculateItemNutrients", () => {
  it("calculates all 10 nutrients proportionally for 100g", () => {
    const { values, grams } = calculateItemNutrients("100", "g", arroz);
    expect(grams).toBe(100);
    expect(values.energyKcal).toBeCloseTo(128.2585, 3);
    expect(values.fiberG).toBeCloseTo(1.561, 3);
    expect(values.sodiumMg).toBeCloseTo(1.2007, 3);
  });

  it("scales linearly for 50g (half of 100g)", () => {
    const full = calculateItemNutrients("100", "g", arroz).values;
    const half = calculateItemNutrients("50", "g", arroz).values;
    expect(half.energyKcal).toBeCloseTo(full.energyKcal! / 2, 5);
    expect(half.fiberG).toBeCloseTo(full.fiberG! / 2, 5);
  });

  it("returns all-null values for zero quantity, never dividing by zero", () => {
    const { values, grams } = calculateItemNutrients("0", "g", arroz);
    expect(grams).toBe(0);
    expect(values.energyKcal).toBeNull();
    expect(values.fiberG).toBeNull();
  });

  it("handles decimal quantities", () => {
    const { values } = calculateItemNutrients("33.5", "g", arroz);
    expect(values.energyKcal).toBeCloseTo((128.2585 * 33.5) / 100, 3);
  });

  it("returns null (never 0) for a nutrient the reference doesn't have", () => {
    const referenceWithoutVitaminC: MacroReferenceFood = { ...banana, vitamina_c_mg: null };
    const { values } = calculateItemNutrients("100", "g", referenceWithoutVitaminC);
    expect(values.vitaminCMg).toBeNull();
    expect(values.energyKcal).not.toBeNull();
  });

  it("returns all-null values when there is no reference at all", () => {
    const { values, grams } = calculateItemNutrients("100", "g", null);
    expect(grams).toBe(100);
    expect(values.energyKcal).toBeNull();
  });
});

describe("sumNutrients — cobertura", () => {
  it("sums known values and tracks full coverage when every item has data", () => {
    const a = calculateItemNutrients("100", "g", arroz).values;
    const b = calculateItemNutrients("100", "g", arroz).values;
    const { values, coverage } = sumNutrients([a, b]);
    expect(values.energyKcal).toBeCloseTo(128.2585 * 2, 3);
    expect(coverage.energyKcal).toEqual({ known: 2, total: 2 });
  });

  it("reflects partial coverage when some items lack a nutrient, without pretending full precision", () => {
    const known = calculateItemNutrients("100", "g", arroz).values;
    const unknownVitaminC: NutrientValues = { ...calculateItemNutrients("100", "g", banana).values, vitaminCMg: null };
    const { values, coverage } = sumNutrients([known, unknownVitaminC]);
    // arroz has vitamina_c_mg null too (per taco.json), so total known vitaminC = 0 here
    expect(coverage.vitaminCMg.known).toBe(0);
    expect(coverage.vitaminCMg.total).toBe(2);
    expect(values.vitaminCMg).toBeNull();
    // energyKcal: both items have it -> full coverage, real sum
    expect(coverage.energyKcal).toEqual({ known: 2, total: 2 });
    expect(values.energyKcal).toBeCloseTo(known.energyKcal! + unknownVitaminC.energyKcal!, 3);
  });

  it("stays null (not 0) when NO item in the list has the nutrient", () => {
    const { values, coverage } = sumNutrients([{ ...calculateItemNutrients("100", "g", arroz).values, ironMg: null }]);
    expect(values.ironMg).toBeNull();
    expect(coverage.ironMg).toEqual({ known: 0, total: 1 });
  });
});

describe("roundedNutrients", () => {
  it("rounds kcal/mg to integers and grams to 1 decimal, preserving null", () => {
    const values: NutrientValues = {
      energyKcal: 128.2585,
      proteinG: 2.5208,
      carbohydrateG: 28.0598,
      fatG: 0.227,
      fiberG: 1.561,
      sodiumMg: 1.2007,
      calciumMg: null,
      ironMg: 0.0767,
      potassiumMg: 14.6737,
      vitaminCMg: null,
    };
    const rounded = roundedNutrients(values);
    expect(rounded.energyKcal).toBe(128);
    expect(rounded.proteinG).toBe(2.5);
    expect(rounded.sodiumMg).toBe(1);
    expect(rounded.potassiumMg).toBe(15);
    expect(rounded.calciumMg).toBeNull();
    expect(rounded.vitaminCMg).toBeNull();
  });
});

describe("resolveItemReference — vinculo estruturado vs fallback por texto", () => {
  const lookup: FoodReferenceLookup = {
    byTacoNumber: (numero) => getTacoFoodByNumber(numero),
    byCustomId: () => null,
    fuzzyMatch: (food) => (food.toLowerCase().includes("banana") ? banana : null),
  };

  it("uses the structured food_ref_id when present (TACO)", () => {
    const reference = resolveItemReference({ food: "Qualquer coisa", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "3" }, lookup);
    expect(reference?.numero).toBe(3);
  });

  it("falls back to fuzzy text match for legacy items without food_ref_id", () => {
    const reference = resolveItemReference({ food: "Banana prata", quantity: "100", unit: "g" }, lookup);
    expect(reference?.numero).toBe(179);
  });

  it("never invents a match when neither the link nor the fuzzy match resolves", () => {
    const reference = resolveItemReference({ food: "Alimento nao catalogado", quantity: "100", unit: "g" }, lookup);
    expect(reference).toBeNull();
  });
});

describe("calculatePlanNutrients — total por refeicao e por dia", () => {
  const lookup: FoodReferenceLookup = {
    byTacoNumber: (numero) => getTacoFoodByNumber(numero),
    byCustomId: () => null,
    fuzzyMatch: () => null,
  };

  it("sums items into meals and meals into a plan total, deterministically", () => {
    const plan = {
      meals: [
        {
          id: "meal-1",
          name: "Café da manhã",
          items: [
            { food: "Arroz", quantity: "100", unit: "g", food_source: "TACO" as const, food_ref_id: "3" },
            { food: "Banana", quantity: "100", unit: "g", food_source: "TACO" as const, food_ref_id: "179" },
          ],
        },
        {
          id: "meal-2",
          name: "Almoço",
          items: [{ food: "Arroz", quantity: "50", unit: "g", food_source: "TACO" as const, food_ref_id: "3" }],
        },
      ],
    };

    const result = calculatePlanNutrients(plan, lookup);
    expect(result.perMeal).toHaveLength(2);
    expect(result.perMeal[0].values.energyKcal).toBeCloseTo(128.2585 + 91.5288, 2);
    expect(result.perMeal[1].values.energyKcal).toBeCloseTo(128.2585 / 2, 2);
    expect(result.total.values.energyKcal).toBeCloseTo(128.2585 + 91.5288 + 128.2585 / 2, 2);
    // vitaminC: arroz has null, banana has 5.86 -> total coverage across 3 items is 1/3
    expect(result.total.coverage.vitaminCMg).toEqual({ known: 1, total: 3 });
  });

  it("never trusts an unrecognized item — it contributes null, not an invented value", () => {
    const plan = { meals: [{ id: "m1", name: "Lanche", items: [{ food: "Coisa inexistente", quantity: "100", unit: "g" }] }] };
    const result = calculatePlanNutrients(plan, lookup);
    expect(result.total.values.energyKcal).toBeNull();
    expect(result.total.coverage.energyKcal).toEqual({ known: 0, total: 1 });
  });
});

describe("calculateItemNutrients — medida caseira vinculada tem prioridade sobre a conversão genérica", () => {
  it("usa a medida caseira quando fornecida, reportando confidence high e o measureId usado", () => {
    const measure: HouseholdMeasureOption = { id: "measure-179-media", description: "1 unidade média", gramEquivalent: 86, source: "TBCA", confidence: "high" };
    const { grams, resolution, values } = calculateItemNutrients("1", "unidade", banana, measure);
    expect(grams).toBe(86);
    expect(resolution).toMatchObject({ method: "food_household_measure", confidence: "high", measureId: "measure-179-media" });
    expect(values.energyKcal).toBeCloseTo((banana.energia_kcal * 86) / 100, 3);
  });

  it("sem medida caseira, cai para a conversão genérica marcada como estimativa (nunca 'precisa')", () => {
    const { resolution } = calculateItemNutrients("1", "unidade", banana);
    expect(resolution.method).toBe("estimated");
    expect(resolution.confidence).toBe("low");
  });
});

describe("calculatePlanNutrients — resumo de qualidade (quantos itens com alta confiança vs estimados)", () => {
  const lookupWithMeasure: FoodReferenceLookup = {
    byTacoNumber: (numero) => getTacoFoodByNumber(numero),
    byCustomId: () => null,
    fuzzyMatch: () => null,
    byMeasureId: (id) => (id === "m-banana-media" ? { id, description: "1 unidade média", gramEquivalent: 86, source: "TBCA", confidence: "high" } : null),
  };

  it("conta itens explícitos em gramas e com medida caseira como alta confiança, e itens com unidade genérica como estimados", () => {
    const plan = {
      meals: [
        {
          id: "m1",
          name: "Café da manhã",
          items: [
            { food: "Arroz", quantity: "100", unit: "g", food_source: "TACO" as const, food_ref_id: "3" }, // explicit_grams -> high
            { food: "Banana", quantity: "1", food_source: "TACO" as const, food_ref_id: "179", household_measure_id: "m-banana-media" }, // food_household_measure -> high
            { food: "Banana", quantity: "1", unit: "unidade", food_source: "TACO" as const, food_ref_id: "179" }, // generico sem medida -> estimated
          ],
        },
      ],
    };
    const result = calculatePlanNutrients(plan, lookupWithMeasure);
    expect(result.quality).toEqual({ total: 3, highConfidence: 2, estimated: 1, unresolved: 0 });
  });

  it("nunca conta um item com alimento vazio (linha de 'adicionar novo item' ainda não preenchida)", () => {
    const plan = { meals: [{ id: "m1", name: "Lanche", items: [{ food: "", quantity: "", unit: "" }] }] };
    const result = calculatePlanNutrients(plan, lookupWithMeasure);
    expect(result.quality.total).toBe(0);
  });

  it("plano legado (sem food_source/food_ref_id/household_measure_id em nenhum item) continua funcionando via match textual, marcado como estimativa quando aplicável", () => {
    const legacyLookup: FoodReferenceLookup = { byTacoNumber: () => null, byCustomId: () => null, fuzzyMatch: (food) => (food.toLowerCase().includes("banana") ? banana : null) };
    const plan = { meals: [{ id: "m1", name: "Lanche", items: [{ food: "Banana prata", quantity: "1", unit: "unidade" }] }] };
    const result = calculatePlanNutrients(plan, legacyLookup);
    expect(result.total.values.energyKcal).not.toBeNull();
    expect(result.quality).toEqual({ total: 1, highConfidence: 0, estimated: 1, unresolved: 0 });
  });
});
