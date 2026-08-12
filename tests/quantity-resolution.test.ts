import { describe, expect, it } from "vitest";
import { resolveQuantity, type HouseholdMeasureOption } from "@/lib/nutrition/quantity-resolution";
import { quantityInGrams } from "@/lib/nutrition/macros";

const bananaMedia: HouseholdMeasureOption = { id: "measure-1", description: "1 unidade média", gramEquivalent: 86, source: "TBCA", confidence: "high" };
const bananaPequena: HouseholdMeasureOption = { id: "measure-2", description: "1 unidade pequena", gramEquivalent: 60, source: "TBCA", confidence: "high" };
const bananaGrande: HouseholdMeasureOption = { id: "measure-3", description: "1 unidade grande", gramEquivalent: 110, source: "TBCA", confidence: "high" };

describe("resolveQuantity — motor central de resolução de quantidade", () => {
  it("gramagem explícita (100 g) -> explicit_grams, confidence high", () => {
    const result = resolveQuantity({ quantity: "100", unit: "g" });
    expect(result).toMatchObject({ grams: 100, method: "explicit_grams", confidence: "high" });
    expect(result.warning).toBeUndefined();
  });

  it("quilograma (1.5 kg) -> generic_unit_conversion, confidence high, 1500 g", () => {
    const result = resolveQuantity({ quantity: "1.5", unit: "kg" });
    expect(result).toMatchObject({ grams: 1500, method: "generic_unit_conversion", confidence: "high" });
  });

  it("medida específica cadastrada (banana + 1 unidade média) -> food_household_measure, confidence high", () => {
    const result = resolveQuantity({ quantity: "1", unit: "unidade média", householdMeasure: bananaMedia });
    expect(result).toMatchObject({ grams: 86, method: "food_household_measure", confidence: "high", measureId: "measure-1", source: "TBCA" });
  });

  it("medidas diferentes do mesmo alimento produzem gramaturas diferentes (pequena/média/grande)", () => {
    const pequena = resolveQuantity({ quantity: "1", householdMeasure: bananaPequena });
    const media = resolveQuantity({ quantity: "1", householdMeasure: bananaMedia });
    const grande = resolveQuantity({ quantity: "1", householdMeasure: bananaGrande });
    expect(pequena.grams).toBe(60);
    expect(media.grams).toBe(86);
    expect(grande.grams).toBe(110);
    expect(new Set([pequena.grams, media.grams, grande.grams]).size).toBe(3);
  });

  it("multiplica a medida pela quantidade (2 unidades médias)", () => {
    const result = resolveQuantity({ quantity: "2", householdMeasure: bananaMedia });
    expect(result.grams).toBe(172);
  });

  it("unidade sem medida cadastrada -> estimated (nunca 'precisa' silenciosamente)", () => {
    const result = resolveQuantity({ quantity: "1", unit: "unidade" });
    expect(result.method).toBe("estimated");
    expect(result.confidence).toBe("low");
    expect(result.grams).toBe(50);
    expect(result.warning).toBeTruthy();
  });

  it("colher COM medida específica cadastrada -> usa a específica (food_household_measure)", () => {
    const colherDosador: HouseholdMeasureOption = { id: "measure-4", description: "1 colher do dosador", gramEquivalent: 22, source: "Nutricionista", confidence: "medium" };
    const result = resolveQuantity({ quantity: "1", unit: "colher", householdMeasure: colherDosador });
    expect(result).toMatchObject({ grams: 22, method: "food_household_measure", confidence: "medium", measureId: "measure-4" });
  });

  it("colher SEM medida específica -> estimated, nunca precisa", () => {
    const result = resolveQuantity({ quantity: "1", unit: "colher" });
    expect(result.method).toBe("estimated");
    expect(result.confidence).toBe("low");
    expect(result.grams).toBe(15);
  });

  it("xícara COM medida específica -> usa a específica", () => {
    const xicaraCheia: HouseholdMeasureOption = { id: "measure-5", description: "1 xícara cheia", gramEquivalent: 180, source: "Nutricionista", confidence: "medium" };
    const result = resolveQuantity({ quantity: "1", unit: "xicara", householdMeasure: xicaraCheia });
    expect(result).toMatchObject({ grams: 180, method: "food_household_measure", measureId: "measure-5" });
  });

  it("xícara SEM medida específica -> estimated, nunca precisa", () => {
    const result = resolveQuantity({ quantity: "1", unit: "xicara" });
    expect(result.method).toBe("estimated");
    expect(result.confidence).toBe("low");
    expect(result.grams).toBe(160);
  });

  it("ml nunca assume densidade universal de 1ml=1g com confiança alta — sempre estimado", () => {
    const result = resolveQuantity({ quantity: "200", unit: "ml" });
    expect(result.method).toBe("estimated");
    expect(result.confidence).toBe("low");
    expect(result.warning).toMatch(/densidade/i);
  });

  it("litro segue a mesma cautela de ml (nunca alta confiança sem medida cadastrada)", () => {
    const result = resolveQuantity({ quantity: "1", unit: "l" });
    expect(result.method).toBe("estimated");
    expect(result.confidence).toBe("low");
    expect(result.grams).toBe(1000);
  });

  it("unidade totalmente desconhecida -> unresolved, nunca inventa gramagem", () => {
    const result = resolveQuantity({ quantity: "3", unit: "porções" });
    expect(result).toMatchObject({ grams: null, method: "unresolved", confidence: "none" });
    expect(result.warning).toBeTruthy();
  });

  it("quantidade ausente ou inválida -> unresolved", () => {
    expect(resolveQuantity({ quantity: null, unit: "g" }).method).toBe("unresolved");
    expect(resolveQuantity({ quantity: "0", unit: "g" }).method).toBe("unresolved");
    expect(resolveQuantity({ quantity: "abc", unit: "g" }).method).toBe("unresolved");
  });

  it("medida caseira tem prioridade máxima mesmo se a unidade de texto for outra coisa", () => {
    // unit diz "xicara" mas ha uma medida especifica vinculada — a medida vinculada manda, nao o texto da unidade.
    const result = resolveQuantity({ quantity: "1", unit: "xicara", householdMeasure: bananaMedia });
    expect(result.grams).toBe(86);
    expect(result.method).toBe("food_household_measure");
  });

  it("quantityInGrams (wrapper legado) nunca quebra: unresolved vira 0, nunca null nem NaN", () => {
    expect(quantityInGrams("3", "porções")).toBe(0);
    expect(quantityInGrams("100", "g")).toBe(100);
    expect(quantityInGrams("1.5", "kg")).toBe(1500);
    expect(quantityInGrams("1", "unidade")).toBe(50);
  });
});
