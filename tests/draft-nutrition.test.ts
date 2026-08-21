import { describe, expect, it } from "vitest";
import { calculateDraftNutrition, calculateDraftNutritionRaw } from "@/lib/nutrition/draft-nutrition";
import { calculatePlanNutrients } from "@/lib/nutrition/nutrients";
import { TACO_REFERENCES, getTacoFoodByNumber } from "@/lib/nutrition/taco";
import type { DraftMeal } from "@/lib/nutrition/draft-types";

/**
 * Prova o requisito central da seção 9 do pedido: o draft é calculável
 * ANTES de aplicar ao editor, usando a MESMA engine (calculatePlanNutrients)
 * — nunca uma fórmula própria. draftNutrition == calculatePlanNutrients
 * equivalente, byte a byte.
 */
describe("calculateDraftNutrition — mesma engine do editor/impressão, nunca uma fórmula própria", () => {
  const sample = TACO_REFERENCES.find((food) => typeof food.numero === "number" && food.energia_kcal > 0)!;

  function buildDraft(): DraftMeal[] {
    return [
      {
        mealKey: "cafe_da_manha",
        name: "Café da manhã",
        suggested_time: "07:30",
        source_recipe_id: null,
        needsReview: [],
        items: [{ food: sample.descricao, displayName: sample.descricao, quantity: "150", unit: "g", food_source: "TACO", food_ref_id: String(sample.numero), ai_suggested: true }],
      },
    ];
  }

  it("total calculado bate exatamente com calculatePlanNutrients chamado diretamente", async () => {
    const draft = buildDraft();
    const summary = await calculateDraftNutrition(draft, { energyKcal: null, proteinG: null, carbohydrateG: null, fatG: null });

    const lookup = { byTacoNumber: (n: string) => getTacoFoodByNumber(n), byCustomId: () => null, fuzzyMatch: () => null };
    const direct = calculatePlanNutrients({ meals: draft }, lookup);

    expect(summary.total.energyKcal).toBe(Math.round(direct.total.values.energyKcal!));
    expect(summary.unresolvedCount).toBe(0);
  });

  it("compara com meta quando informada", async () => {
    const draft = buildDraft();
    const summary = await calculateDraftNutrition(draft, { energyKcal: 2000, proteinG: null, carbohydrateG: null, fatG: null });
    const energyRow = summary.targetComparison.find((row) => row.nutrient === "energyKcal");
    expect(energyRow?.target).toBe(2000);
    // prescribed vem da soma BRUTA (precisão total, nunca arredondada
    // antes da comparação) — só arredonda perto do valor exibido em `total`.
    expect(Math.round(energyRow!.prescribed!)).toBe(summary.total.energyKcal);
  });

  it("sem meta nenhuma, targetComparison fica vazio — nunca inventa uma meta", async () => {
    const draft = buildDraft();
    const summary = await calculateDraftNutrition(draft, { energyKcal: null, proteinG: null, carbohydrateG: null, fatG: null });
    expect(summary.targetComparison).toHaveLength(0);
  });

  it("refeição vazia (só needsReview, sem items) calcula null, nunca inventa um número", async () => {
    const draft: DraftMeal[] = [{ mealKey: "lanche_tarde", name: "Lanche", suggested_time: null, source_recipe_id: null, items: [], needsReview: [{ query: "chá misterioso", quantity: "1", unit: "unidade", status: "NOT_FOUND", reason: "x", candidates: [] }] }];
    const summary = await calculateDraftNutrition(draft, { energyKcal: null, proteinG: null, carbohydrateG: null, fatG: null });
    expect(summary.total.energyKcal).toBeNull();
  });

  it("calculateDraftNutritionRaw devolve valores não arredondados (usado pelo optimizer)", async () => {
    const draft = buildDraft();
    const raw = await calculateDraftNutritionRaw(draft);
    expect(raw.energyKcal).toBeCloseTo(sample.energia_kcal * 1.5, 4);
  });
});
