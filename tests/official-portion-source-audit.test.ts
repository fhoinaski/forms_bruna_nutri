import { describe, expect, it } from "vitest";
import { normalizeIbgePofPortion, normalizeUsdaPortion } from "../scripts/food-data/official-portion-source-audit.mjs";

describe("F3.2 official portion source audit adapters", () => {
  it("preserves USDA official portion identifiers, measure, qualifier, and grams", () => {
    const portion = normalizeUsdaPortion({ id: 123, fdcId: 456, amount: 1, modifier: "large", gramWeight: 61, portionDescription: "1 large egg", measureUnit: { id: 999, name: "large", abbreviation: "lg" } });
    expect(portion).toMatchObject({ source: "USDA", sourceFoodId: "456", sourcePortionId: "123", amount: 1, measure: "large", qualifier: "large", grams: 61, rawDescription: "1 large egg" });
  });

  it("does not invent a USDA portion ID or gram weight", () => {
    const portion = normalizeUsdaPortion({ amount: "2", measureUnit: { name: "slice" } }, "789");
    expect(portion).toMatchObject({ sourceFoodId: "789", sourcePortionId: null, amount: 2, measure: "slice", grams: null });
  });

  it("builds the IBGE stable composite portion ID from official codes", () => {
    const portion = normalizeIbgePofPortion({ codigo_alimento: 6300101, codigo_preparacao: 99, codigo_tipo_medida: 12, descricao_tipo_medida: "COLHER DE ARROZ/SERVIR", quantidade_em_gramas: 45, descricao_alimento_referencia: "Arroz cozido" });
    expect(portion).toMatchObject({ source: "IBGE_POF", sourceFoodId: "6300101:99", sourcePortionId: "6300101:99:12", amount: 1, measure: "COLHER DE ARROZ/SERVIR", grams: 45, rawDescription: "Arroz cozido" });
  });
});
