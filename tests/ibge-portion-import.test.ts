import { describe, expect, it } from "vitest";
import { buildImportPlan, portionId } from "../scripts/food-data/ibge-portion-import.mjs";

const portion = { foodCode: "6300101", preparationCode: "99", measureCode: "12", measure: "COLHER DE ARROZ/SERVIR", grams: 45, rawDescription: "Arroz cozido" };
const canonical = [{ id: "ibge:6300101:99", source_food_id: "6300101:99" }];

describe("IBGE official portion import plan", () => {
  it("uses the stable food-preparation-measure key and keeps preparation binding", () => {
    expect(portionId("6300101", "99", "12")).toBe("6300101:99:12");
    const result = buildImportPlan([portion], canonical, []);
    expect(result.plan[0]).toMatchObject({ canonicalFoodId: "ibge:6300101:99", sourceFoodId: "6300101:99", sourcePortionId: "6300101:99:12", status: "NEW_PORTION" });
  });
  it("blocks invalid grams and missing canonical identities", () => {
    const result = buildImportPlan([{ ...portion, grams: 0 }, { ...portion, foodCode: "missing" }], canonical, []);
    expect(result.counts).toMatchObject({ INVALID: 1, BLOCKED_NO_CANONICAL: 1, NEW_PORTIONS: 0 });
  });
  it("does not overwrite source portion conflicts", () => {
    const result = buildImportPlan([portion], canonical, [{ source: "IBGE_POF", source_portion_id: "6300101:99:12", canonical_food_id: "ibge:6300101:99", label: "1 COLHER DE ARROZ/SERVIR", gram_weight: 44 }]);
    expect(result.counts.CONFLICTS).toBe(1);
    expect(result.plan[0].status).toBe("SOURCE_PORTION_CONFLICT");
  });
});
