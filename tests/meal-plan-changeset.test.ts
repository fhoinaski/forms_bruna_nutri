import { describe, expect, it } from "vitest";
import {
  isMealLockedForCopilot,
  matchMealKeyToExisting,
  selectableMealKeys,
  draftMealMatchesExisting,
  computeMealPlanChangeset,
  mergeChangesetIntoMeals,
  describeMealPlanChangeset,
  type ExistingPlanMeal,
} from "@/lib/ai/agents/nutrition/meal-plan-changeset";
import type { DraftMeal } from "@/lib/nutrition/draft-types";

function draftMeal(overrides: Partial<DraftMeal> & { mealKey: DraftMeal["mealKey"] }): DraftMeal {
  return { name: "Refeição", suggested_time: null, source_recipe_id: null, items: [], needsReview: [], ...overrides };
}

describe("isMealLockedForCopilot — R5 (seção 27)", () => {
  it("uma refeição com qualquer item quantity_locked ou substitutions_locked é bloqueada", () => {
    expect(isMealLockedForCopilot({ name: "Almoço", items: [{ food: "Arroz", quantity_locked: true }] })).toBe(true);
    expect(isMealLockedForCopilot({ name: "Almoço", items: [{ food: "Arroz", substitutions_locked: true }] })).toBe(true);
    expect(isMealLockedForCopilot({ name: "Almoço", items: [{ food: "Arroz" }] })).toBe(false);
  });
});

describe("matchMealKeyToExisting — casa por nome, nunca por posição", () => {
  const existing: ExistingPlanMeal[] = [
    { name: "Jantar", items: [] },
    { name: "Almoço", items: [] },
    { name: "Café da manhã", items: [] },
  ];

  it("encontra a refeição certa mesmo fora de ordem", () => {
    const match = matchMealKeyToExisting(existing, "almoco");
    expect(match?.meal.name).toBe("Almoço");
    expect(match?.index).toBe(1);
  });

  it("retorna null quando não há correspondência clara — nunca um palpite arriscado", () => {
    const match = matchMealKeyToExisting(existing, "ceia");
    expect(match).toBeNull();
  });
});

describe("selectableMealKeys — refeições bloqueadas nunca aparecem como opção regenerável", () => {
  it("marca locked=true para uma refeição existente com item bloqueado, false para as demais", () => {
    const existing: ExistingPlanMeal[] = [{ name: "Almoço", items: [{ food: "Arroz", quantity_locked: true }] }];
    const result = selectableMealKeys(existing, ["almoco", "jantar"]);
    expect(result.find((r) => r.key === "almoco")?.locked).toBe(true);
    expect(result.find((r) => r.key === "jantar")?.locked).toBe(false);
    expect(result.find((r) => r.key === "jantar")?.existingName).toBeNull();
  });
});

describe("draftMealMatchesExisting — comparação por conteúdo, nunca por referência", () => {
  it("considera igual quando alimento/quantidade/identidade batem", () => {
    const draft = draftMeal({ mealKey: "almoco", items: [{ food: "Arroz", displayName: "Arroz", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "3", ai_suggested: true }] });
    const existing: ExistingPlanMeal = { name: "Almoço", items: [{ food: "Arroz", quantity: "100", food_ref_id: "3" }] };
    expect(draftMealMatchesExisting(draft, existing)).toBe(true);
  });

  it("considera diferente quando a quantidade muda", () => {
    const draft = draftMeal({ mealKey: "almoco", items: [{ food: "Arroz", displayName: "Arroz", quantity: "150", unit: "g", food_source: "TACO", food_ref_id: "3", ai_suggested: true }] });
    const existing: ExistingPlanMeal = { name: "Almoço", items: [{ food: "Arroz", quantity: "100", food_ref_id: "3" }] };
    expect(draftMealMatchesExisting(draft, existing)).toBe(false);
  });
});

describe("computeMealPlanChangeset — KEEP/MODIFY/ADD/REMOVE (seções 25/26/28/29)", () => {
  const existing: ExistingPlanMeal[] = [
    { name: "Café da manhã", items: [{ food: "Pão", quantity: "50", food_ref_id: "50" }] },
    { name: "Almoço", items: [{ food: "Arroz", quantity: "100", food_ref_id: "3" }] },
    { name: "Jantar", items: [{ food: "Sopa", quantity: "300", food_ref_id: "9" }] },
  ];

  it("refeição regenerada com conteúdo diferente vira MODIFY; não tocadas viram KEEP", () => {
    const regenerated = [draftMeal({ mealKey: "almoco", name: "Almoço", items: [{ food: "Batata doce", displayName: "Batata doce", quantity: "150", unit: "g", food_source: "TACO", food_ref_id: "88", ai_suggested: true }] })];
    const changeset = computeMealPlanChangeset(existing, regenerated, ["almoco"]);
    expect(changeset.modify).toEqual(["Almoço"]);
    expect(changeset.keep.sort()).toEqual(["Café da manhã", "Jantar"].sort());
    expect(changeset.add).toEqual([]);
    expect(changeset.remove).toEqual([]);
  });

  it("chave regenerada sem correspondência existente vira ADD", () => {
    const regenerated = [draftMeal({ mealKey: "ceia", name: "Ceia", items: [{ food: "Iogurte", displayName: "Iogurte", quantity: "170", unit: "g", food_source: "TACO", food_ref_id: "10", ai_suggested: true }] })];
    const changeset = computeMealPlanChangeset(existing, regenerated, ["ceia"]);
    expect(changeset.add).toEqual(["Ceia"]);
    expect(changeset.keep).toHaveLength(3);
  });

  it("resultado regenerado idêntico ao existente conta como KEEP, nunca MODIFY (evita diff enganoso)", () => {
    const regenerated = [draftMeal({ mealKey: "almoco", name: "Almoço", items: [{ food: "Arroz", displayName: "Arroz", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "3", ai_suggested: true }] })];
    const changeset = computeMealPlanChangeset(existing, regenerated, ["almoco"]);
    expect(changeset.modify).toEqual([]);
    expect(changeset.keep).toContain("Almoço");
  });

  it("nunca popula REMOVE — o Copilot nunca apaga uma refeição existente sozinho (seção 28)", () => {
    const changeset = computeMealPlanChangeset(existing, [], []);
    expect(changeset.remove).toEqual([]);
    expect(changeset.keep).toHaveLength(3);
  });

  it("describeMealPlanChangeset formata a contagem no padrão pedido", () => {
    const changeset = { keep: ["a", "b", "c"], modify: ["d", "e"], add: ["f"], remove: [] };
    expect(describeMealPlanChangeset(changeset)).toBe("3 refeição(ões) mantida(s), 2 alterada(s), 1 adicionada(s), 0 removida(s)");
  });
});

describe("mergeChangesetIntoMeals — aplica sem reordenar/apagar o que não foi tocado", () => {
  const existing: ExistingPlanMeal[] = [
    { name: "Café da manhã", items: [{ food: "Pão", quantity: "50", food_ref_id: "50" }] },
    { name: "Almoço", items: [{ food: "Arroz", quantity: "100", food_ref_id: "3" }] },
  ];

  type Merged = { name: string; source: "draft" | "existing" };

  it("substitui só a refeição casada, mantém a outra intacta, e acrescenta uma nova refeição no final", () => {
    const regenerated = [
      draftMeal({ mealKey: "almoco", name: "Almoço", items: [{ food: "Batata doce", displayName: "Batata doce", quantity: "150", unit: "g", food_source: "TACO", food_ref_id: "88", ai_suggested: true }] }),
      draftMeal({ mealKey: "ceia", name: "Ceia", items: [{ food: "Iogurte", displayName: "Iogurte", quantity: "170", unit: "g", food_source: "TACO", food_ref_id: "10", ai_suggested: true }] }),
    ];
    const merged = mergeChangesetIntoMeals<ExistingPlanMeal, DraftMeal, Merged>(
      existing,
      regenerated,
      ["almoco", "ceia"],
      (meal) => ({ name: meal.name, source: "draft" }),
      (meal) => ({ name: meal.name, source: "existing" })
    );
    expect(merged.map((m) => m.name)).toEqual(["Café da manhã", "Almoço", "Ceia"]);
    expect(merged[0].source).toBe("existing");
    expect(merged[1].source).toBe("draft");
    expect(merged[2].source).toBe("draft");
  });

  it("nunca toca uma refeição existente cuja chave não foi pedida pra regenerar", () => {
    const merged = mergeChangesetIntoMeals<ExistingPlanMeal, DraftMeal, Merged>(
      existing,
      [],
      [],
      (meal) => ({ name: meal.name, source: "draft" }),
      (meal) => ({ name: meal.name, source: "existing" })
    );
    expect(merged.every((m) => m.source === "existing")).toBe(true);
    expect(merged).toHaveLength(2);
  });
});

describe("R5.1 — lock/comparação estrutura-consciente também dentro de OPTIONS/COMBINATION (seção 28)", () => {
  it("isMealLockedForCopilot detecta um lock ESCONDIDO dentro de uma option — não só em meal.items", () => {
    const meal: ExistingPlanMeal = {
      name: "Café da manhã",
      items: [],
      options: [{ items: [{ food: "Ovo", quantity_locked: true }] }],
    };
    expect(isMealLockedForCopilot(meal)).toBe(true);
  });

  it("isMealLockedForCopilot detecta um lock escondido dentro de um choice_group", () => {
    const meal: ExistingPlanMeal = {
      name: "Almoço",
      items: [],
      choice_groups: [{ items: [{ food: "Frango", substitutions_locked: true }] }],
    };
    expect(isMealLockedForCopilot(meal)).toBe(true);
  });

  it("draftMealMatchesExisting nunca considera SIMPLE igual a OPTIONS/COMBINATION mesmo com os mesmos itens fixos", () => {
    const draft = draftMeal({ mealKey: "cafe_da_manha", meal_structure: "SIMPLE", items: [] });
    const existing: ExistingPlanMeal = { name: "Café da manhã", items: [], options: [{ items: [{ food: "Ovo", quantity: "100", food_ref_id: "1" }] }] };
    expect(draftMealMatchesExisting(draft, existing)).toBe(false);
  });

  it("draftMealMatchesExisting compara options item a item quando ambos são OPTIONS", () => {
    const draft = draftMeal({
      mealKey: "cafe_da_manha", meal_structure: "OPTIONS", items: [],
      options: [{ id: "option-0", label: "A", items: [{ food: "Ovo", displayName: "Ovo", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "1", ai_suggested: true }], needsReview: [] }],
    });
    const same: ExistingPlanMeal = { name: "Café da manhã", items: [], options: [{ items: [{ food: "Ovo", quantity: "100", food_ref_id: "1" }] }] };
    const different: ExistingPlanMeal = { name: "Café da manhã", items: [], options: [{ items: [{ food: "Ovo", quantity: "200", food_ref_id: "1" }] }] };
    expect(draftMealMatchesExisting(draft, same)).toBe(true);
    expect(draftMealMatchesExisting(draft, different)).toBe(false);
  });

  it("computeMealPlanChangeset: uma refeição OPTIONS regenerada com conteúdo diferente vira MODIFY, respeitando a estrutura", () => {
    const existing: ExistingPlanMeal[] = [{ name: "Café da manhã", items: [], options: [{ items: [{ food: "Ovo", quantity: "100", food_ref_id: "1" }] }] }];
    const regenerated = [draftMeal({
      mealKey: "cafe_da_manha", name: "Café da manhã", meal_structure: "OPTIONS", items: [],
      options: [{ id: "option-0", label: "A", items: [{ food: "Iogurte", displayName: "Iogurte", quantity: "170", unit: "g", food_source: "TACO", food_ref_id: "2", ai_suggested: true }], needsReview: [] }],
    })];
    const changeset = computeMealPlanChangeset(existing, regenerated, ["cafe_da_manha"]);
    expect(changeset.modify).toEqual(["Café da manhã"]);
  });

  it("mergeChangesetIntoMeals preserva options/choice_groups inteiros da refeição casada (nunca achata pra SIMPLE)", () => {
    const existing: ExistingPlanMeal[] = [{ name: "Café da manhã", items: [] }];
    const regenerated = [draftMeal({
      mealKey: "cafe_da_manha", name: "Café da manhã", meal_structure: "OPTIONS", items: [],
      options: [
        { id: "option-0", label: "A", items: [{ food: "Ovo", displayName: "Ovo", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "1", ai_suggested: true }], needsReview: [] },
        { id: "option-1", label: "B", items: [{ food: "Iogurte", displayName: "Iogurte", quantity: "170", unit: "g", food_source: "TACO", food_ref_id: "2", ai_suggested: true }], needsReview: [] },
      ],
    })];
    const merged = mergeChangesetIntoMeals<ExistingPlanMeal, DraftMeal, DraftMeal>(
      existing, regenerated, ["cafe_da_manha"],
      (meal) => meal,
      (meal) => draftMeal({ mealKey: "cafe_da_manha", name: meal.name })
    );
    expect(merged[0].meal_structure).toBe("OPTIONS");
    expect(merged[0].options).toHaveLength(2);
  });
});
