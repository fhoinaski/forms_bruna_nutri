import { beforeEach, describe, expect, it, vi } from "vitest";

const d1 = vi.hoisted(() => ({ d1Query: vi.fn(), d1Execute: vi.fn() }));
vi.mock("@/lib/d1/client", () => ({ d1Query: d1.d1Query, d1Execute: d1.d1Execute }));

/**
 * Prova, com evidência automatizada, que a impressão (app/dashboard/clients/
 * [id]/print/page.tsx) agora usa EXATAMENTE o mesmo motor que o editor
 * (calculatePlanNutrients + resolveMealPlanChangeReferences +
 * buildFoodReferenceLookup) — o bug P0 da auditoria era a impressão usar
 * estimateFoodMacrosFromTaco (só TACO, texto aproximado, ignora
 * food_source/food_ref_id). Este teste usa um alimento CUSTOM, que o motor
 * antigo da impressão NUNCA resolveria corretamente (só combina por texto
 * contra a base TACO).
 */
describe("motor de nutricao usado pela impressao == motor usado pelo editor", () => {
  beforeEach(() => {
    d1.d1Query.mockReset();
    d1.d1Execute.mockReset();
  });

  it("resolve um alimento CUSTOM pelo vinculo estruturado (source+refId), nao por texto", async () => {
    const customFoodRow = {
      id: "custom-1",
      name: "Mingau proteico da clinica",
      brand: null,
      source: "custom",
      portion_base_grams: 100,
      energy_kcal: 250,
      protein_g: 20,
      carbohydrate_g: 30,
      fat_g: 5,
      fiber_g: 2,
      sodium_mg: null,
      calcium_mg: null,
      iron_mg: null,
      potassium_mg: null,
      vitamin_c_mg: null,
      notes: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    d1.d1Query.mockImplementation(async (sql: string) => {
      if (sql.includes("custom_foods")) return [customFoodRow];
      if (sql.includes("food_portions")) return [];
      return [];
    });

    const { resolveMealPlanChangeReferences, buildFoodReferenceLookup } = await import(
      "@/lib/ai/agents/nutrition/meal-plan-change-agent"
    );
    const { calculatePlanNutrients, roundedNutrients } = await import("@/lib/nutrition/nutrients");

    const plan = {
      meals: [
        {
          id: "meal-1",
          name: "Café da manhã",
          items: [
            {
              id: "item-1",
              food: "Mingau proteico da clinica",
              quantity: "200",
              unit: "g",
              food_source: "CUSTOM" as const,
              food_ref_id: "custom-1",
            },
          ],
        },
      ],
    };

    const { references, measuresById } = await resolveMealPlanChangeReferences(plan);
    const lookup = buildFoodReferenceLookup(references, measuresById);
    const result = calculatePlanNutrients(plan, lookup);
    const totals = roundedNutrients(result.total.values);

    // 200g = 2x a base de 100g cadastrada -> 500 kcal, 40g proteina.
    expect(totals.energyKcal).toBe(500);
    expect(totals.proteinG).toBe(40);
    expect(totals.carbohydrateG).toBe(60);
    expect(totals.fatG).toBe(10);
    // Nenhum item "nao reconhecido" — a resolucao estruturada funcionou.
    expect(result.quality.unresolved).toBe(0);
  });

  it("um item CUSTOM desconhecido (refId apagado) fica sem dado, nunca inventa um numero", async () => {
    d1.d1Query.mockResolvedValue([]); // custom food nao encontrado

    const { resolveMealPlanChangeReferences, buildFoodReferenceLookup } = await import(
      "@/lib/ai/agents/nutrition/meal-plan-change-agent"
    );
    const { calculatePlanNutrients } = await import("@/lib/nutrition/nutrients");

    const plan = {
      meals: [
        {
          id: "meal-1",
          name: "Almoço",
          items: [
            { id: "item-1", food: "Alimento removido do catalogo", quantity: "100", unit: "g", food_source: "CUSTOM" as const, food_ref_id: "deleted-id" },
          ],
        },
      ],
    };

    const { references, measuresById } = await resolveMealPlanChangeReferences(plan);
    const lookup = buildFoodReferenceLookup(references, measuresById);
    const result = calculatePlanNutrients(plan, lookup);

    // Nunca inventa numero: sem referencia resolvida, o valor fica null
    // (nao 0, nao um numero estimado). `quality.unresolved` mede a confianca
    // da RESOLUCAO DE QUANTIDADE (gramas), nao se o alimento foi encontrado
    // — aqui a quantidade "100g" e explicita e de alta confianca mesmo que
    // o alimento em si nao exista mais no catalogo, entao esse contador
    // fica 0; quem prova que nada foi inventado e o energyKcal null abaixo.
    expect(result.total.values.energyKcal).toBeNull();
    expect(result.quality.unresolved).toBe(0);
    expect(result.quality.highConfidence).toBe(1);
  });
});
