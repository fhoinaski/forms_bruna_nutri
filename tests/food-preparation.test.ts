import { describe, expect, it } from "vitest";
import { extractPreparation, needsPreparationReview } from "@/lib/nutrition/food-preparation";

describe("extractPreparation — extração determinística de alimento base + preparo", () => {
  it.each([
    ["ovo cozido", "ovo", "COOKED"],
    ["ovo mexido", "ovo", "SCRAMBLED"],
    ["ovo frito", "ovo", "FRIED"],
    ["frango grelhado", "frango", "GRILLED"],
    ["frango assado", "frango", "ROASTED"],
    ["filé de frango grelhado", "filé de frango", "GRILLED"],
    ["arroz cozido", "arroz", "COOKED"],
    ["batata cozida", "batata", "COOKED"],
    ["tilápia assada", "tilápia", "ROASTED"],
    ["frango cru", "frango", "RAW"],
    ["brócolis no vapor", "brócolis no", "STEAMED"],
  ] as const)('"%s" -> baseFoodQuery "%s", preparation %s', (query, baseFoodQuery, preparation) => {
    const result = extractPreparation(query);
    expect(result.baseFoodQuery).toBe(baseFoodQuery);
    expect(result.preparation).toBe(preparation);
  });

  it('"purê de batata" -> baseFoodQuery "batata", preparation PUREED (nunca vira "batata cozida" sozinho)', () => {
    const result = extractPreparation("purê de batata");
    expect(result.baseFoodQuery).toBe("batata");
    expect(result.preparation).toBe("PUREED");
  });

  it('"café com leite" -> addedIngredientPhrase detectado, preparation null (não é método de cocção)', () => {
    const result = extractPreparation("café com leite");
    expect(result.preparation).toBeNull();
    expect(result.addedIngredientPhrase).toBe("com leite");
    expect(result.baseFoodQuery).toBe("café");
  });

  it('"café com açúcar" -> addedIngredientPhrase detectado', () => {
    const result = extractPreparation("café com açúcar");
    expect(result.addedIngredientPhrase).toBe("com açúcar");
  });

  it('"café sem açúcar" -> NUNCA detecta ingrediente adicionado (ausência, não adição)', () => {
    const result = extractPreparation("café sem açúcar");
    expect(result.addedIngredientPhrase).toBeNull();
    expect(result.preparation).toBeNull();
  });

  it("query sem preparo nenhum -> preparation null, addedIngredientPhrase null, baseFoodQuery inalterado", () => {
    const result = extractPreparation("banana prata");
    expect(result.preparation).toBeNull();
    expect(result.addedIngredientPhrase).toBeNull();
    expect(result.baseFoodQuery).toBe("banana prata");
  });
});

describe("needsPreparationReview", () => {
  it("true quando há preparo OU ingrediente adicionado", () => {
    expect(needsPreparationReview({ baseFoodQuery: "ovo", preparation: "SCRAMBLED", addedIngredientPhrase: null })).toBe(true);
    expect(needsPreparationReview({ baseFoodQuery: "café", preparation: null, addedIngredientPhrase: "com leite" })).toBe(true);
  });

  it("false quando nenhum dos dois foi detectado", () => {
    expect(needsPreparationReview({ baseFoodQuery: "banana", preparation: null, addedIngredientPhrase: null })).toBe(false);
  });
});
