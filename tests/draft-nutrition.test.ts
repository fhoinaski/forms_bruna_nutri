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

/**
 * R5.1 (seções 7, 32, 35-37) — calculateDraftNutrition passa a usar
 * calculateFlexiblePlanNutrients (a MESMA engine já usada pelo Composer
 * manual pra OPTIONS/COMBINATION), nunca soma alternativas.
 */
describe("calculateDraftNutrition — OPTIONS/COMBINATION nunca somam alternativas (R5.1)", () => {
  const sorted = [...TACO_REFERENCES].filter((food) => typeof food.numero === "number" && food.energia_kcal > 0).sort((a, b) => a.energia_kcal - b.energia_kcal);
  const cheap = sorted[0];
  const expensive = sorted[sorted.length - 1];

  function toItem(food: typeof cheap, quantity: string): DraftMeal["items"][number] {
    return { food: food.descricao, displayName: food.descricao, quantity, unit: "g", food_source: "TACO", food_ref_id: String(food.numero), ai_suggested: true };
  }

  it("OPTIONS: total.energyKcal usa o MÁXIMO entre as opções, nunca a soma das duas", async () => {
    const draft: DraftMeal[] = [{
      mealKey: "cafe_da_manha", name: "Café da manhã", suggested_time: null, source_recipe_id: null,
      meal_structure: "OPTIONS", items: [], needsReview: [],
      options: [
        { id: "option-0", label: "Opção A", items: [toItem(cheap, "100")], needsReview: [] },
        { id: "option-1", label: "Opção B", items: [toItem(expensive, "100")], needsReview: [] },
      ],
    }];
    const summary = await calculateDraftNutrition(draft, { energyKcal: null, proteinG: null, carbohydrateG: null, fatG: null });
    const cheapKcal = (cheap.energia_kcal * 100) / 100;
    const expensiveKcal = (expensive.energia_kcal * 100) / 100;
    expect(summary.totalRange.varies).toBe(true);
    expect(summary.totalRange.min.energyKcal).toBeCloseTo(cheapKcal, 0);
    expect(summary.totalRange.max.energyKcal).toBeCloseTo(expensiveKcal, 0);
    // total (backward-compatible, valor único) reflete o teto — nunca a soma das duas opções.
    expect(summary.total.energyKcal).toBeCloseTo(expensiveKcal, 0);
    expect(summary.total.energyKcal).not.toBeCloseTo(cheapKcal + expensiveKcal, 0);
  });

  it("COMBINATION: choice_group contribui só o menor/maior item do grupo (min_selections=max_selections=1), item opcional soma no max mas não no min", async () => {
    const draft: DraftMeal[] = [{
      mealKey: "almoco", name: "Almoço", suggested_time: null, source_recipe_id: null,
      meal_structure: "COMBINATION", items: [{ ...toItem(expensive, "50"), is_optional: true }], needsReview: [],
      choice_groups: [{ id: "group-0", title: "Proteína", min_selections: 1, max_selections: 1, items: [toItem(cheap, "100"), toItem(expensive, "100")], needsReview: [] }],
    }];
    const summary = await calculateDraftNutrition(draft, { energyKcal: null, proteinG: null, carbohydrateG: null, fatG: null });
    expect(summary.totalRange.varies).toBe(true);
    // min: grupo contribui só o item mais barato, item opcional não conta.
    expect(summary.totalRange.min.energyKcal).toBeCloseTo(cheap.energia_kcal, 0);
    // max: grupo contribui o item mais caro + o item opcional conta também.
    expect(summary.totalRange.max.energyKcal).toBeCloseTo(expensive.energia_kcal + (expensive.energia_kcal * 50) / 100, 0);
  });

  it("draft 100% SIMPLE continua com min===max (varies=false) — nenhuma regressão de comportamento anterior", async () => {
    const draft = [{ mealKey: "jantar" as const, name: "Jantar", suggested_time: null, source_recipe_id: null, meal_structure: "SIMPLE" as const, items: [toItem(cheap, "100")], needsReview: [] }];
    const summary = await calculateDraftNutrition(draft, { energyKcal: null, proteinG: null, carbohydrateG: null, fatG: null });
    expect(summary.totalRange.varies).toBe(false);
    expect(summary.totalRange.min.energyKcal).toBe(summary.totalRange.max.energyKcal);
    expect(summary.total.energyKcal).toBe(summary.totalRange.max.energyKcal);
  });
});
