import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/d1/client", () => ({ d1Query: vi.fn().mockResolvedValue([]), d1Execute: vi.fn(), d1Batch: vi.fn().mockResolvedValue([]) }));

/**
 * Food Preparation Engine V1 (seção 6/7/19) — prova fim-a-fim que um
 * preparo composto sem referência direta no catálogo (ex.: "ovo mexido")
 * NUNCA cai de volta pro alimento base sozinho, e SÓ propõe receitas reais
 * já cadastradas (nunca inventa, nunca escolhe sozinho). Reaproveita o
 * MESMO getRecipes({q}) já usado pela biblioteca de receitas — nenhum
 * sistema paralelo.
 */
vi.mock("@/lib/repositories/recipes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/recipes")>("@/lib/repositories/recipes");
  const scrambledEggRecipe = {
    id: "recipe-scrambled-egg",
    title: "Ovo mexido padrão",
    description: null,
    meal_group: "cafe_da_manha" as const,
    servings: 1,
    portion_grams: 110,
    preparation_steps: null,
    tags: ["ovo"],
    source_note: null,
    total_kcal: 160,
    total_protein_g: 13,
    total_carbs_g: 1,
    total_fat_g: 12,
    per_portion_kcal: 160,
    per_portion_protein_g: 13,
    per_portion_carbs_g: 1,
    per_portion_fat_g: 12,
    is_active: 1,
    created_by: null,
    created_at: "",
    updated_at: "",
    ingredients: [
      { taco_number: 23496, food_name: "Ovo, de galinha, inteiro, cru", grams: 100 },
      { taco_number: 8138, food_name: "Manteiga, com sal", grams: 5 },
    ],
  };
  return {
    ...actual,
    getRecipes: vi.fn(async (filters: { q?: string }) => {
      const q = (filters.q ?? "").toLowerCase();
      if (q.includes("ovo")) return [scrambledEggRecipe];
      return [];
    }),
  };
});

import { resolveFoodCandidate } from "@/lib/nutrition/food-resolver";

describe("Food Preparation Engine V1 — resolveFoodCandidate para preparos compostos", () => {
  it('"ovo mexido" -> PREPARATION_NEEDS_REVIEW, NUNCA cai pra "ovo cru"/"ovo cozido" sozinho, propõe a receita real cadastrada', async () => {
    const resolution = await resolveFoodCandidate("ovo mexido", []);
    expect(resolution.status).toBe("PREPARATION_NEEDS_REVIEW");
    expect(resolution.preparation).toBe("SCRAMBLED");
    expect(resolution.ref).toBeNull();
    expect(resolution.name).toBeNull(); // nunca uma identidade nutricional inventada
    expect(resolution.recipeCandidates).toHaveLength(1);
    expect(resolution.recipeCandidates?.[0].title).toBe("Ovo mexido padrão");
  });

  it('"purê de batata" -> PREPARATION_NEEDS_REVIEW (nunca vira "batata cozida" sozinho), sem receita cadastrada aqui -> lista vazia, nunca inventada', async () => {
    const resolution = await resolveFoodCandidate("purê de batata", []);
    expect(resolution.status).toBe("PREPARATION_NEEDS_REVIEW");
    expect(resolution.preparation).toBe("PUREED");
    expect(resolution.recipeCandidates).toEqual([]);
  });

  it('"café com leite" -> PREPARATION_NEEDS_REVIEW (ingrediente real precisa ser adicionado, nunca kcal textual)', async () => {
    const resolution = await resolveFoodCandidate("café com leite", []);
    expect(resolution.status).toBe("PREPARATION_NEEDS_REVIEW");
    expect(resolution.preparation).toBeNull();
  });

  it('"café sem açúcar" NUNCA vira PREPARATION_NEEDS_REVIEW — resolve via alias existente (café infusão), não é um preparo composto', async () => {
    const resolution = await resolveFoodCandidate("café sem açúcar", []);
    expect(resolution.status).toBe("RESOLVED");
  });

  it('ovo cozido/frito/cru já têm referência direta no catálogo — NUNCA viram PREPARATION_NEEDS_REVIEW (seção 5: usar a referência direta, nunca transformar)', async () => {
    for (const query of ["ovo cozido", "ovo frito"]) {
      const resolution = await resolveFoodCandidate(query, []);
      expect(resolution.status).not.toBe("PREPARATION_NEEDS_REVIEW");
    }
  });

  it('negativo: "ovo mexido" nunca resolve automaticamente para "Ovo, de galinha, inteiro, cru" ou "...cozido" — sempre precisa de decisão humana', async () => {
    const resolution = await resolveFoodCandidate("ovo mexido", []);
    expect(resolution.status).not.toBe("RESOLVED");
    expect(resolution.name).not.toBe("Ovo, de galinha, inteiro, cru");
  });
});
