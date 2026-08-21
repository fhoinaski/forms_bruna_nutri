import { describe, expect, it } from "vitest";
import {
  optimizeDraftToTargetV2,
  DEFAULT_HARD_MAX_GRAMS,
  DEFAULT_OPTIMIZER_TOLERANCES,
} from "@/lib/nutrition/draft-optimizer-v2";
import { calculateDraftNutritionRaw } from "@/lib/nutrition/draft-nutrition";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";
import type { DraftMeal } from "@/lib/nutrition/draft-types";

/**
 * Optimizer V2 — busca local multi-objetivo, determinística, nunca usa IA,
 * nunca troca/adiciona alimento, resultado final sempre validado pela
 * engine real (calculateDraftNutritionRaw) — nunca confia no total previsto
 * usado internamente pra ranquear candidatos.
 */

const proteinDense = TACO_REFERENCES.find((f) => typeof f.numero === "number" && (f.proteina_g ?? 0) > 20 && (f.lipidios_g ?? 0) < 12 && (f.carboidrato_g ?? 0) < 5)!;
const carbDense = TACO_REFERENCES.find((f) => typeof f.numero === "number" && (f.carboidrato_g ?? 0) > 60 && (f.proteina_g ?? 0) < 10)!;
const fatDense = TACO_REFERENCES.find((f) => typeof f.numero === "number" && (f.lipidios_g ?? 0) > 60)!;
const balanced = TACO_REFERENCES.find((f) => typeof f.numero === "number" && (f.energia_kcal ?? 0) > 50 && (f.energia_kcal ?? 0) < 200 && (f.proteina_g ?? 0) > 1 && (f.carboidrato_g ?? 0) > 1)!;

function item(food: typeof proteinDense, grams: number): DraftMeal["items"][number] {
  return { food: food.descricao, displayName: food.descricao, quantity: String(grams), unit: "g", food_source: "TACO", food_ref_id: String(food.numero), ai_suggested: true };
}

function meal(mealKey: DraftMeal["mealKey"], name: string, items: DraftMeal["items"]): DraftMeal {
  return { mealKey, name, suggested_time: null, source_recipe_id: null, items, needsReview: [] };
}

describe("optimizeDraftToTargetV2 — energy only", () => {
  it("aproxima energia da meta e melhora o score, respeitando limites", async () => {
    const draft: DraftMeal[] = [meal("almoco", "Almoço", [item(carbDense, 150), item(proteinDense, 100), item(fatDense, 20)])];
    const before = await calculateDraftNutritionRaw(draft);
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: 1800 });
    expect(result.activeTargets).toEqual(["energy"]);
    expect(Math.abs(result.nutritionAfter.energyKcal! - 1800)).toBeLessThan(Math.abs(before.energyKcal! - 1800));
    expect(result.scoreAfter).toBeLessThanOrEqual(result.scoreBefore);
    for (const meal of result.meals) {
      for (const it of meal.items) {
        expect(Number(it.quantity)).toBeLessThanOrEqual(DEFAULT_HARD_MAX_GRAMS);
        expect(Number(it.quantity)).toBeGreaterThan(0);
      }
    }
  });
});

describe("optimizeDraftToTargetV2 — protein low (multi-objetivo real)", () => {
  it("não escala tudo cegamente — melhora proteína sem destruir os demais eixos", async () => {
    // Meta: 1800 kcal, P 130g. Draft: ~1700 kcal, P baixa (~70g).
    const draft: DraftMeal[] = [
      meal("almoco", "Almoço", [item(carbDense, 200), item(proteinDense, 60), item(fatDense, 15)]),
      meal("jantar", "Jantar", [item(carbDense, 150), item(proteinDense, 40)]),
    ];
    const before = await calculateDraftNutritionRaw(draft);
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: 1800, proteinG: 130 });
    expect(result.activeTargets.sort()).toEqual(["energy", "protein"]);
    expect(Math.abs(result.nutritionAfter.proteinG! - 130)).toBeLessThan(Math.abs(before.proteinG! - 130));
    expect(result.scoreAfter).toBeLessThan(result.scoreBefore);
    // Prova de que não é só "escala tudo": o item denso em proteína cresceu mais, proporcionalmente, que o denso em carboidrato.
    const proteinItem = result.meals[0].items.find((i) => i.food === proteinDense.descricao)!;
    const carbItem = result.meals[0].items.find((i) => i.food === carbDense.descricao)!;
    const proteinGrowth = Number(proteinItem.quantity) / 60;
    const carbGrowth = Number(carbItem.quantity) / 200;
    expect(proteinGrowth).toBeGreaterThan(carbGrowth);
  });
});

describe("optimizeDraftToTargetV2 — carb high", () => {
  it("reduz candidatos ricos em carboidrato quando isso melhora o score", async () => {
    const draft: DraftMeal[] = [meal("almoco", "Almoço", [item(carbDense, 300), item(proteinDense, 100)])];
    const before = await calculateDraftNutritionRaw(draft);
    expect(before.carbohydrateG).toBeGreaterThan(180);
    const result = await optimizeDraftToTargetV2(draft, { carbohydrateG: 130 });
    expect(result.activeTargets).toEqual(["carbohydrate"]);
    expect(result.nutritionAfter.carbohydrateG!).toBeLessThan(before.carbohydrateG!);
    const carbItem = result.meals[0].items.find((i) => i.food === carbDense.descricao)!;
    expect(Number(carbItem.quantity)).toBeLessThan(300);
  });
});

describe("optimizeDraftToTargetV2 — multi target", () => {
  it("scoreAfter < scoreBefore com energia+proteína+carboidrato+gordura simultâneos", async () => {
    const draft: DraftMeal[] = [
      meal("almoco", "Almoço", [item(carbDense, 220), item(proteinDense, 50), item(fatDense, 10)]),
      meal("jantar", "Jantar", [item(carbDense, 100), item(proteinDense, 40), item(balanced, 80)]),
    ];
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: 1800, proteinG: 130, carbohydrateG: 190, fatG: 55 });
    expect(result.activeTargets.sort()).toEqual(["carbohydrate", "energy", "fat", "protein"]);
    expect(result.scoreAfter).toBeLessThan(result.scoreBefore);
  });
});

describe("optimizeDraftToTargetV2 — locked item", () => {
  it("item bloqueado nunca muda de quantidade", async () => {
    const draft: DraftMeal[] = [meal("almoco", "Almoço", [item(carbDense, 100), item(proteinDense, 100)])];
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: 2500 }, { lockedItemKeys: ["0:0"] });
    expect(result.meals[0].items[0].quantity).toBe("100");
  });
});

describe("optimizeDraftToTargetV2 — meal lock", () => {
  it("refeição bloqueada não tem nenhum item alterado", async () => {
    const draft: DraftMeal[] = [
      meal("almoco", "Almoço", [item(carbDense, 100), item(proteinDense, 100)]),
      meal("jantar", "Jantar", [item(carbDense, 100)]),
    ];
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: 3000 }, { lockedMealKeys: ["almoco"] });
    expect(result.meals[0].items[0].quantity).toBe("100");
    expect(result.meals[0].items[1].quantity).toBe("100");
    expect(result.adjustments.every((a) => a.mealIndex !== 0)).toBe(true);
  });
});

describe("optimizeDraftToTargetV2 — limits", () => {
  it("nenhuma quantidade ultrapassa o hard max, mesmo com meta absurda", async () => {
    const draft: DraftMeal[] = [meal("almoco", "Almoço", [item(carbDense, 100)])];
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: 50_000 }, { maxIterations: 200 });
    for (const meal of result.meals) {
      for (const it of meal.items) {
        expect(Number(it.quantity)).toBeLessThanOrEqual(DEFAULT_HARD_MAX_GRAMS);
      }
    }
  });

  it("respeita bounds relativos configurados (0.5x-2x por padrão)", async () => {
    const draft: DraftMeal[] = [meal("almoco", "Almoço", [item(carbDense, 100)])];
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: 50_000 }, { maxIterations: 200 });
    expect(Number(result.meals[0].items[0].quantity)).toBeLessThanOrEqual(200); // 2x de 100
  });
});

describe("optimizeDraftToTargetV2 — rounding", () => {
  it("quantidades finais são números práticos (múltiplos de 5g), nunca decimais longos", async () => {
    const draft: DraftMeal[] = [meal("almoco", "Almoço", [item(carbDense, 100), item(proteinDense, 80)])];
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: 1400 });
    for (const meal of result.meals) {
      for (const it of meal.items) {
        const grams = Number(it.quantity);
        expect(grams % 5).toBe(0);
      }
    }
  });
});

describe("optimizeDraftToTargetV2 — no improvement", () => {
  it("stopReason NO_IMPROVEMENT quando nenhum candidato melhora (bounds impedem qualquer movimento útil)", async () => {
    const draft: DraftMeal[] = [meal("almoco", "Almoço", [item(carbDense, 100)])];
    // relativeBounds igual a 1x-1x: nenhum movimento é permitido, então nunca há progresso possível.
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: 5000 }, { relativeBounds: { min: 1, max: 1 } });
    expect(result.stopReason).toBe("NO_IMPROVEMENT");
    expect(result.adjustments).toHaveLength(0);
  });
});

describe("optimizeDraftToTargetV2 — already good", () => {
  it("draft já dentro da tolerância: zero alterações, stopReason WITHIN_TOLERANCE", async () => {
    const draft: DraftMeal[] = [meal("almoco", "Almoço", [item(balanced, 500)])];
    const before = await calculateDraftNutritionRaw(draft);
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: before.energyKcal! });
    expect(result.stopReason).toBe("WITHIN_TOLERANCE");
    expect(result.iterations).toBe(0);
    expect(result.adjustments).toHaveLength(0);
  });
});

describe("optimizeDraftToTargetV2 — meal distribution", () => {
  it("com distribuição ativa, o optimizer favorece mover a refeição que está mais longe do seu sub-alvo", async () => {
    const draft: DraftMeal[] = [
      meal("almoco", "Almoço", [item(carbDense, 50)]), // bem abaixo do esperado (almoço deveria ser 30% de 2000 = 600kcal)
      meal("jantar", "Jantar", [item(carbDense, 200)]),
    ];
    const result = await optimizeDraftToTargetV2(
      draft,
      { energyKcal: 2000 },
      { mealDistribution: [{ mealKey: "almoco", percentage: 30 }, { mealKey: "jantar", percentage: 25 }] }
    );
    // Pelo menos um ajuste deve ter ocorrido no almoço (estava mais longe do sub-alvo).
    expect(result.adjustments.some((a) => a.mealIndex === 0)).toBe(true);
  });
});

describe("optimizeDraftToTargetV2 — receitas (itens já expandidos)", () => {
  it("trata ingredientes de receita como itens independentes, sem duplicar contagem", async () => {
    const draft: DraftMeal[] = [
      { mealKey: "almoco", name: "Frango com arroz", suggested_time: null, source_recipe_id: "recipe-1", items: [item(carbDense, 100), item(proteinDense, 100)], needsReview: [] },
    ];
    const before = await calculateDraftNutritionRaw(draft);
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: 1500 });
    expect(result.meals[0].source_recipe_id).toBe("recipe-1"); // preservado
    // paridade: soma dos itens finais bate com o total oficial recalculado (sem contagem dupla de "porção" + "itens").
    const finalRaw = await calculateDraftNutritionRaw(result.meals);
    expect(result.nutritionAfter.energyKcal).toBeCloseTo(finalRaw.energyKcal!, 4);
    expect(before.energyKcal).not.toBeNull();
  });
});

describe("optimizeDraftToTargetV2 — paridade com a engine oficial", () => {
  it("nutritionAfter é EXATAMENTE o resultado de recalcular o draft otimizado pela engine", async () => {
    const draft: DraftMeal[] = [meal("almoco", "Almoço", [item(carbDense, 150), item(proteinDense, 100), item(fatDense, 20)])];
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: 1800, proteinG: 100 });
    const recalculated = await calculateDraftNutritionRaw(result.meals);
    expect(result.nutritionAfter.energyKcal).toBeCloseTo(recalculated.energyKcal!, 6);
    expect(result.nutritionAfter.proteinG).toBeCloseTo(recalculated.proteinG!, 6);
  });
});

describe("optimizeDraftToTargetV2 — nunca toca item CLINICAL_UNKNOWN (needsSafetyReview)", () => {
  it("item com segurança clínica não confirmada não é ajustado, mesmo estando em `items`", async () => {
    const unsafeItem = { ...item(carbDense, 100), needsSafetyReview: true };
    const draft: DraftMeal[] = [meal("almoco", "Almoço", [unsafeItem, item(proteinDense, 50)])];
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: 5000 }, { maxIterations: 100 });
    expect(result.meals[0].items[0].quantity).toBe("100");
  });
});

describe("optimizeDraftToTargetV2 — sem meta nenhuma", () => {
  it("nunca inventa uma meta ausente — stopReason NO_ACTIVE_TARGETS, draft intocado", async () => {
    const draft: DraftMeal[] = [meal("almoco", "Almoço", [item(carbDense, 100)])];
    const result = await optimizeDraftToTargetV2(draft, {});
    expect(result.stopReason).toBe("NO_ACTIVE_TARGETS");
    expect(result.meals).toBe(draft);
  });
});

describe("optimizeDraftToTargetV2 — activeTargets restrito (seção 25)", () => {
  it("com activeTargets=['protein'], só otimiza proteína mesmo com meta de energia também informada", async () => {
    const draft: DraftMeal[] = [meal("almoco", "Almoço", [item(carbDense, 100), item(proteinDense, 50)])];
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: 3000, proteinG: 150 }, { activeTargets: ["protein"] });
    expect(result.activeTargets).toEqual(["protein"]);
  });

  it("activeTargets nunca inclui um eixo sem meta real, mesmo se pedido explicitamente", async () => {
    const draft: DraftMeal[] = [meal("almoco", "Almoço", [item(carbDense, 100)])];
    const result = await optimizeDraftToTargetV2(draft, { energyKcal: 1800 }, { activeTargets: ["protein", "energy"] });
    expect(result.activeTargets).toEqual(["energy"]);
  });
});

describe("DEFAULT_OPTIMIZER_TOLERANCES — documentado, não mágico", () => {
  it("expõe as tolerâncias padrão como constante nomeada", () => {
    expect(DEFAULT_OPTIMIZER_TOLERANCES.energyPct).toBeGreaterThan(0);
    expect(DEFAULT_OPTIMIZER_TOLERANCES.proteinPct).toBeGreaterThan(0);
  });
});
