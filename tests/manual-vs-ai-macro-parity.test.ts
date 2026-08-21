import { describe, expect, it } from "vitest";
import { findFoodReferenceByIdentity, resolveFoodItemMacros, type MacroReferenceFood } from "@/lib/nutrition/macros";
import type { HouseholdMeasureOption, QuantityConfidence } from "@/lib/nutrition/quantity-resolution";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";

/**
 * Prova (item 21/28 do pedido) que o caminho MANUAL (MealItemsEditor.tsx,
 * que chama resolveFoodItemMacros direto com o item editado) e o caminho da
 * IA (meal-plan-change-agent.ts, funcao interna resolveFoodMacros — nao
 * exportada, entao replicada aqui exatamente: findFoodReferenceByIdentity +
 * resolveFoodItemMacros) produzem o MESMO resultado para o mesmo
 * alimento+quantidade, porque os dois convergem no mesmo motor central.
 *
 * `resolveFoodMacros` (lib/ai/agents/nutrition/meal-plan-change-agent.ts,
 * linha ~188) e uma function local nao exportada; em vez de exporta-la so
 * para teste, este arquivo replica seu corpo exato (2 linhas, comentado
 * abaixo) para comparar contra o caminho manual sem alterar codigo de
 * producao.
 */

const sampleTaco = TACO_REFERENCES.find((food) => typeof food.numero === "number" && food.energia_kcal > 0)!;

// Replica exata de resolveFoodMacros() em meal-plan-change-agent.ts:188-200.
function aiResolveFoodMacros(
  food: { source: string; refId: string; foodName: string },
  quantity: number,
  unit: string,
  references: MacroReferenceFood[],
  householdMeasure?: HouseholdMeasureOption | null
) {
  const reference = findFoodReferenceByIdentity(references, food.source, food.refId);
  if (reference) {
    return resolveFoodItemMacros({ food: reference.descricao, quantity, unit }, [reference], householdMeasure ?? null);
  }
  return resolveFoodItemMacros({ food: food.foodName, quantity, unit }, references, householdMeasure ?? null);
}

describe("manual == IA: mesmo alimento + mesma quantidade produz os mesmos macros", () => {
  it("100g de um alimento TACO (vinculo por source+refId)", () => {
    const references = [sampleTaco];
    const refId = String(sampleTaco.numero);

    // Caminho MANUAL: MealItemsEditor.tsx chama resolveFoodItemMacros direto
    // com o item (food_source/food_ref_id vindos do cadastro selecionado).
    const manual = resolveFoodItemMacros(
      { food: sampleTaco.descricao, quantity: "100", unit: "g", food_source: "TACO", food_ref_id: refId },
      references,
      null
    );

    // Caminho IA: proposta estruturada com { source, refId, foodName }.
    const ai = aiResolveFoodMacros({ source: "TACO", refId, foodName: sampleTaco.descricao }, 100, "g", references, null);

    expect(ai.macros).toEqual(manual.macros);
    expect(ai.reference?.numero).toBe(manual.reference?.numero);
  });

  it("200g do mesmo alimento — continuam identicos", () => {
    const references = [sampleTaco];
    const refId = String(sampleTaco.numero);

    const manual = resolveFoodItemMacros(
      { food: sampleTaco.descricao, quantity: "200", unit: "g", food_source: "TACO", food_ref_id: refId },
      references,
      null
    );
    const ai = aiResolveFoodMacros({ source: "TACO", refId, foodName: sampleTaco.descricao }, 200, "g", references, null);

    expect(ai.macros).toEqual(manual.macros);
    // 200g e o dobro de 100g: confere que ambos escalaram igual.
    const manual100 = resolveFoodItemMacros(
      { food: sampleTaco.descricao, quantity: "100", unit: "g", food_source: "TACO", food_ref_id: refId },
      references,
      null
    );
    expect(manual.macros.kcal).toBeCloseTo(manual100.macros.kcal * 2, 5);
  });

  it("com medida caseira registrada (1 unidade = X gramas cadastrados)", () => {
    const references = [sampleTaco];
    const refId = String(sampleTaco.numero);
    const measure: HouseholdMeasureOption = {
      id: "measure-1",
      description: "1 unidade média",
      gramEquivalent: 80,
      confidence: "high" satisfies QuantityConfidence,
    };

    const manual = resolveFoodItemMacros(
      { food: sampleTaco.descricao, quantity: "1", unit: "unidade média", food_source: "TACO", food_ref_id: refId },
      references,
      measure
    );
    const ai = aiResolveFoodMacros({ source: "TACO", refId, foodName: sampleTaco.descricao }, 1, "unidade média", references, measure);

    expect(ai.macros).toEqual(manual.macros);
    expect(ai.quantity.grams).toBe(80);
    expect(manual.quantity.grams).toBe(80);
  });

  it("alimento CUSTOM (fonte custom, vinculo por refId) — mesmo resultado nos dois caminhos", () => {
    const customFood: MacroReferenceFood = {
      numero: "custom-1",
      descricao: "Mingau proteico da clinica",
      fonte: "custom",
      energia_kcal: 250,
      proteina_g: 20,
      carboidrato_g: 30,
      lipidios_g: 5,
    };
    const references = [customFood];

    const manual = resolveFoodItemMacros(
      { food: customFood.descricao, quantity: "150", unit: "g", food_source: "CUSTOM", food_ref_id: "custom-1" },
      references,
      null
    );
    const ai = aiResolveFoodMacros({ source: "CUSTOM", refId: "custom-1", foodName: customFood.descricao }, 150, "g", references, null);

    expect(ai.macros).toEqual(manual.macros);
    // 150g = 1.5x a base de 100g cadastrada.
    expect(manual.macros.kcal).toBeCloseTo(375, 5);
  });

  it("alimento MANUFACTURER (fonte manufacturer, vinculo por refId) — mesmo resultado nos dois caminhos", () => {
    const manufacturerFood: MacroReferenceFood = {
      numero: "mfr-1",
      descricao: "Whey Protein Marca X (porção 30g)",
      fonte: "manufacturer",
      energia_kcal: 120,
      proteina_g: 24,
      carboidrato_g: 3,
      lipidios_g: 1.5,
    };
    const references = [manufacturerFood];

    const manual = resolveFoodItemMacros(
      { food: manufacturerFood.descricao, quantity: "30", unit: "g", food_source: "MANUFACTURER", food_ref_id: "mfr-1" },
      references,
      null
    );
    const ai = aiResolveFoodMacros({ source: "MANUFACTURER", refId: "mfr-1", foodName: manufacturerFood.descricao }, 30, "g", references, null);

    expect(ai.macros).toEqual(manual.macros);
  });
});
