import { describe, expect, it } from "vitest";
import { cleanMealsForSave, duplicateItemAt, duplicateMealAt, reorderArray, type Meal, type MealItem } from "@/components/dashboard/MealItemsEditor";

/**
 * Helpers puros de reordenar/duplicar do MealPlanEditor UX 2.0. Persistem
 * naturalmente no proximo save porque lib/repositories/meal-plans.ts grava
 * sort_order pelo indice do array e sempre gera um id novo por linha —
 * confirmado lendo o repositorio antes de implementar (ver plano). Aqui so
 * testamos a mecanica pura do array em memoria.
 */

describe("reorderArray", () => {
  it("move um item uma posicao para cima", () => {
    expect(reorderArray(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
  });

  it("move um item uma posicao para baixo", () => {
    expect(reorderArray(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("nao faz nada ao tentar mover o primeiro item para cima", () => {
    const list = ["a", "b", "c"];
    expect(reorderArray(list, 0, -1)).toBe(list);
  });

  it("nao faz nada ao tentar mover o ultimo item para baixo", () => {
    const list = ["a", "b", "c"];
    expect(reorderArray(list, 2, 1)).toBe(list);
  });
});

function makeMeal(name: string, items: MealItem[] = [{ food: "Arroz", quantity: "100", unit: "g" }]): Meal {
  return { name, suggested_time: "", notes: "", source_recipe_id: null, items };
}

describe("duplicateMealAt", () => {
  it("insere uma copia logo apos a refeicao original, com sufixo no nome", () => {
    const meals = [makeMeal("Cafe da manha"), makeMeal("Almoco")];
    const result = duplicateMealAt(meals, 0);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("Cafe da manha");
    expect(result[1].name).toBe("Cafe da manha (cópia)");
    expect(result[2].name).toBe("Almoco");
  });

  it("copia os itens da refeicao original sem compartilhar referencia", () => {
    const meals = [makeMeal("Lanche", [{ food: "Banana", quantity: "1", unit: "unidade" }])];
    const result = duplicateMealAt(meals, 0);
    result[1].items[0].food = "Maca";
    expect(meals[0].items[0].food).toBe("Banana");
  });

  it("nao faz nada para um indice fora dos limites", () => {
    const meals = [makeMeal("Cafe da manha")];
    expect(duplicateMealAt(meals, 5)).toBe(meals);
  });
});

describe("duplicateItemAt", () => {
  it("insere uma copia do item logo apos o original", () => {
    const items: MealItem[] = [
      { food: "Arroz", quantity: "100", unit: "g" },
      { food: "Feijao", quantity: "80", unit: "g" },
    ];
    const result = duplicateItemAt(items, 0);
    expect(result).toHaveLength(3);
    expect(result[0].food).toBe("Arroz");
    expect(result[1].food).toBe("Arroz");
    expect(result[2].food).toBe("Feijao");
  });

  it("copia o item sem compartilhar referencia com o original", () => {
    const items: MealItem[] = [{ food: "Arroz", quantity: "100", unit: "g" }];
    const result = duplicateItemAt(items, 0);
    result[1].quantity = "200";
    expect(items[0].quantity).toBe("100");
  });

  it("nao faz nada para um indice fora dos limites", () => {
    const items: MealItem[] = [{ food: "Arroz", quantity: "100", unit: "g" }];
    expect(duplicateItemAt(items, 5)).toBe(items);
  });
});

/**
 * FASE 8.5 (item 2/20) — o contrato do slot (grupo/subgrupo/papel/id do
 * slot/elegibilidade de troca) precisa sobreviver a um ciclo de "Salvar" no
 * editor, não só existir no momento em que "Criar por modelo" cria o item.
 * cleanMealsForSave é a ÚNICA função que decide o que vai no body do PUT —
 * se ela dropasse esses campos, o slot "morreria" no primeiro save manual.
 */
describe("cleanMealsForSave — proveniência de slot sobrevive ao save", () => {
  it("preserva slot_food_group/subgroup/nutritional_role/template_slot_id/slot_exchange_eligible", () => {
    const meals: Meal[] = [
      {
        name: "Almoço",
        items: [
          {
            food: "Peito de frango grelhado",
            quantity: "130",
            unit: "g",
            slot_food_group: "PROTEIN",
            slot_food_subgroup: "POULTRY",
            slot_nutritional_role: "LEAN_PROTEIN",
            template_slot_id: "slot-123",
            slot_exchange_eligible: true,
          },
        ],
      },
    ];

    const cleaned = cleanMealsForSave(meals);

    expect(cleaned[0].items[0]).toMatchObject({
      slot_food_group: "PROTEIN",
      slot_food_subgroup: "POULTRY",
      slot_nutritional_role: "LEAN_PROTEIN",
      template_slot_id: "slot-123",
      slot_exchange_eligible: true,
    });
  });

  it("um item sem slot (manual/legado) continua com todos os campos de slot null — nunca inventa proveniência", () => {
    const meals: Meal[] = [{ name: "Jantar", items: [{ food: "Sopa de legumes", quantity: "300", unit: "g" }] }];

    const cleaned = cleanMealsForSave(meals);

    expect(cleaned[0].items[0]).toMatchObject({
      slot_food_group: null,
      slot_food_subgroup: null,
      slot_nutritional_role: null,
      template_slot_id: null,
      slot_exchange_eligible: null,
    });
  });

  it("slot_exchange_eligible=false (água/tempero/suplemento) é preservado como false, nunca virado null/true", () => {
    const meals: Meal[] = [
      { name: "Lanche", items: [{ food: "Água com gás", quantity: "200", unit: "ml", slot_food_group: "OTHER", slot_exchange_eligible: false }] },
    ];

    const cleaned = cleanMealsForSave(meals);

    expect(cleaned[0].items[0].slot_exchange_eligible).toBe(false);
  });
});
