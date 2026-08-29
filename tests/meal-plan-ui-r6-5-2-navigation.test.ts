import { describe, expect, it } from "vitest";
import { deriveMealNavEntries } from "@/components/dashboard/MealNavigationRail";

describe("MealNavigationRail — deriveMealNavEntries (R6.5.2)", () => {
  it("deriva índice, nome e horário diretamente de meals, sem estado próprio", () => {
    const entries = deriveMealNavEntries([
      { name: "Café da manhã", suggested_time: "07:30" },
      { name: "Almoço", suggested_time: "12:30" },
    ]);
    expect(entries).toEqual([
      { index: 0, name: "Café da manhã", time: "07:30" },
      { index: 1, name: "Almoço", time: "12:30" },
    ]);
  });

  it("usa 'Refeição N' quando o nome está vazio (mesma convenção de MealItemsEditor)", () => {
    const entries = deriveMealNavEntries([{ name: "", suggested_time: null }, { name: "   ", suggested_time: undefined }]);
    expect(entries.map((entry) => entry.name)).toEqual(["Refeição 1", "Refeição 2"]);
  });

  it("normaliza horário vazio/whitespace para null (nunca string vazia)", () => {
    const entries = deriveMealNavEntries([{ name: "Jantar", suggested_time: "   " }, { name: "Ceia", suggested_time: undefined }]);
    expect(entries.map((entry) => entry.time)).toEqual([null, null]);
  });

  it("reflete adicionar/excluir/reordenar automaticamente (deriva de meals, não mantém cópia)", () => {
    const original = [{ name: "Café", suggested_time: "07:00" }, { name: "Almoço", suggested_time: "12:00" }];
    expect(deriveMealNavEntries(original).map((entry) => entry.name)).toEqual(["Café", "Almoço"]);

    const afterAdd = [...original, { name: "Jantar", suggested_time: "20:00" }];
    expect(deriveMealNavEntries(afterAdd).map((entry) => entry.name)).toEqual(["Café", "Almoço", "Jantar"]);

    const afterDelete = afterAdd.filter((_, index) => index !== 1);
    expect(deriveMealNavEntries(afterDelete).map((entry) => entry.name)).toEqual(["Café", "Jantar"]);

    const afterReorder = [afterDelete[1]!, afterDelete[0]!];
    expect(deriveMealNavEntries(afterReorder).map((entry) => entry.name)).toEqual(["Jantar", "Café"]);
  });

  it("retorna lista vazia quando não há refeições", () => {
    expect(deriveMealNavEntries([])).toEqual([]);
  });
});
