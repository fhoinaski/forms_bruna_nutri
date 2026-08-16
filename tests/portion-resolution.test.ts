import { describe, expect, it } from "vitest";
import { normalizePortionUnit, resolvePortionToGrams, type UnifiedFoodPortion } from "@/lib/nutrition/portion-resolution";

const bananaRef = { source: "TACO" as const, sourceId: "179" };
const eggRef = { source: "TACO" as const, sourceId: "488" };

const bananaMedium: UnifiedFoodPortion = {
  id: "portion-banana-medium",
  foodRef: bananaRef,
  label: "1 unidade média",
  quantity: 1,
  unit: "unidade média",
  unitKind: "medium_unit",
  gramWeight: 86,
  mlWeight: null,
  source: "TBCA",
  provenance: "v1",
  confidence: "high",
};

describe("portion-resolution — porções unificadas", () => {
  it("normaliza aliases brasileiros sem inventar gramagem", () => {
    expect(normalizePortionUnit("1 colher de sopa cheia")).toBe("tablespoon");
    expect(normalizePortionUnit("1 xícara de chá")).toBe("cup");
    expect(normalizePortionUnit("1 unidade média")).toBe("medium_unit");
    expect(normalizePortionUnit("medida do fabricante")).toBe("other");
  });

  it("resolve porção selecionada para gramas usando apenas gramWeight cadastrado", () => {
    const result = resolvePortionToGrams({ foodRef: bananaRef, portionId: bananaMedium.id, quantity: "2", portions: [bananaMedium] });
    expect(result).toMatchObject({ ok: true, grams: 172, quantity: 2, source: "TBCA", provenance: "v1" });
  });

  it("rejeita quantidade inválida, alimento errado e porção sem gramagem", () => {
    expect(resolvePortionToGrams({ foodRef: bananaRef, portionId: bananaMedium.id, quantity: "0", portions: [bananaMedium] })).toEqual({ ok: false, reason: "INVALID_QUANTITY" });
    expect(resolvePortionToGrams({ foodRef: eggRef, portionId: bananaMedium.id, quantity: "1", portions: [bananaMedium] })).toEqual({ ok: false, reason: "WRONG_FOOD" });
    expect(resolvePortionToGrams({
      foodRef: bananaRef,
      portionId: "ml-only",
      quantity: "1",
      portions: [{ ...bananaMedium, id: "ml-only", gramWeight: null, mlWeight: 200, unitKind: "milliliters" }],
    })).toEqual({ ok: false, reason: "MISSING_GRAM_WEIGHT" });
  });
});
