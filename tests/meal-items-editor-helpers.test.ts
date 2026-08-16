import { describe, expect, it } from "vitest";
import { duplicateItemAt, duplicateMealAt, reorderArray, type Meal, type MealItem } from "@/components/dashboard/MealItemsEditor";

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
