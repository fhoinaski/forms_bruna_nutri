import { describe, expect, it } from "vitest";
import { optimizeDraftToTarget, DEFAULT_MAX_ITERATIONS } from "@/lib/nutrition/draft-optimizer";
import { calculateDraftNutritionRaw } from "@/lib/nutrition/draft-nutrition";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";
import type { DraftMeal } from "@/lib/nutrition/draft-types";

/**
 * Optimizer determinístico — o LLM nunca "tenta calcular até bater a
 * meta" (seção 11). Escala quantidades dos itens já resolvidos, sempre via
 * a engine real (calculateDraftNutritionRaw), nunca inventa alimento novo,
 * nunca passa de maxIterations.
 */
describe("optimizeDraftToTarget", () => {
  const sample = TACO_REFERENCES.find((food) => typeof food.numero === "number" && food.energia_kcal > 50)!;

  function buildDraft(grams: number): DraftMeal[] {
    return [
      {
        mealKey: "almoco",
        name: "Almoço",
        suggested_time: null,
        source_recipe_id: null,
        needsReview: [],
        items: [{ food: sample.descricao, displayName: sample.descricao, quantity: String(grams), unit: "g", food_source: "TACO", food_ref_id: String(sample.numero), ai_suggested: true }],
      },
    ];
  }

  it("draft abaixo da meta: optimizer aumenta a energia calculada e aproxima da meta", async () => {
    const startGrams = Math.round((950 / sample.energia_kcal) * 100);
    const draft = buildDraft(startGrams);
    const before = await calculateDraftNutritionRaw(draft);

    const result = await optimizeDraftToTarget(draft, { energyKcal: 1600, proteinG: null, carbohydrateG: null, fatG: null });

    expect(result.after.energyKcal!).toBeGreaterThan(before.energyKcal!);
    expect(Math.abs(result.after.energyKcal! - 1600)).toBeLessThan(Math.abs(before.energyKcal! - 1600));
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.iterations).toBeLessThanOrEqual(DEFAULT_MAX_ITERATIONS);
  });

  it("nunca passa do limite de iterações", async () => {
    // Meta absurdamente alta — nunca convergirá dentro da tolerância, mas
    // o fator é sempre limitado (MAX_SCALE_FACTOR), então o loop deve
    // parar por falta de progresso bem antes do limite nominal também.
    const draft = buildDraft(50);
    const result = await optimizeDraftToTarget(draft, { energyKcal: 100_000, proteinG: null, carbohydrateG: null, fatG: null }, { maxIterations: 3 });
    expect(result.iterations).toBeLessThanOrEqual(3);
  });

  it("draft já dentro da tolerância: zero alterações", async () => {
    const startGrams = Math.round((1600 / sample.energia_kcal) * 100);
    const draft = buildDraft(startGrams);
    const result = await optimizeDraftToTarget(draft, { energyKcal: 1600, proteinG: null, carbohydrateG: null, fatG: null });
    expect(result.iterations).toBe(0);
    expect(result.meals[0].items[0].quantity).toBe(draft[0].items[0].quantity);
  });

  it("sem meta de energia: retorna o draft original sem otimizar, nunca inventa uma meta", async () => {
    const draft = buildDraft(100);
    const result = await optimizeDraftToTarget(draft, { energyKcal: null, proteinG: null, carbohydrateG: null, fatG: null });
    expect(result.iterations).toBe(0);
    expect(result.meals).toBe(draft);
  });

  it("nunca troca o alimento — só ajusta a quantidade do mesmo food_ref_id", async () => {
    const draft = buildDraft(50);
    const result = await optimizeDraftToTarget(draft, { energyKcal: 1600, proteinG: null, carbohydrateG: null, fatG: null });
    expect(result.meals[0].items[0].food_ref_id).toBe(String(sample.numero));
    expect(result.meals[0].items[0].food).toBe(sample.descricao);
  });

  it("meta de proteína: o optimizer melhora a proximidade sem exigir perfeição absoluta", async () => {
    const draft = buildDraft(50);
    const beforeRaw = await calculateDraftNutritionRaw(draft);
    const result = await optimizeDraftToTarget(draft, { energyKcal: 1600, proteinG: 120, carbohydrateG: null, fatG: null });
    const afterProteinDiff = Math.abs((result.after.proteinG ?? 0) - 120);
    const beforeProteinDiff = Math.abs((beforeRaw.proteinG ?? 0) - 120);
    expect(afterProteinDiff).toBeLessThanOrEqual(beforeProteinDiff);
  });
});
