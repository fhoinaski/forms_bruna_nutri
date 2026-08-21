import { describe, expect, it } from "vitest";
import { roundedMacros, sumMacros, type MacroTotals } from "@/lib/nutrition/macros";

/**
 * Regressão do bug de double-rounding corrigido em MealItemsEditor.tsx e
 * ProtocolBuilder.tsx (item 23 do pedido de auditoria): o total do
 * plano/protocolo deve ser a soma BRUTA das refeições/fases, arredondada
 * uma única vez — nunca a soma de valores já arredondados individualmente.
 */
function meal(kcal: number, protein: number, carbs: number, fat: number): MacroTotals {
  return { kcal, protein, carbs, fat, recognizedItems: 1, totalItems: 1 };
}

describe("padrão correto: soma bruta -> arredonda uma vez (não soma arredondados)", () => {
  it("reproduz um caso onde arredondar por refeição e depois somar diverge do total preciso", () => {
    // Três refeições com kcal fracionário que, arredondadas individualmente
    // ANTES de somar, produzem um total diferente do total preciso
    // arredondado no final.
    const rawMeals: MacroTotals[] = [meal(100.4, 5.04, 10.04, 2.04), meal(100.4, 5.04, 10.04, 2.04), meal(100.4, 5.04, 10.04, 2.04)];

    // Comportamento ERRADO (o bug): arredonda cada refeição, depois soma os arredondados.
    const buggyTotal = sumMacros(rawMeals.map((raw) => roundedMacros(raw)));

    // Comportamento CORRETO (o fix aplicado): soma bruta, arredonda uma vez.
    const correctTotal = roundedMacros(sumMacros(rawMeals));

    // 100.4 arredonda para 100 por refeição (3 x 100 = 300 no caminho com bug),
    // mas a soma bruta e 301.2, que arredonda para 301 — os dois caminhos
    // devem divergir neste caso construído, provando que a ordem importa.
    expect(buggyTotal.kcal).toBe(300);
    expect(correctTotal.kcal).toBe(301);
    expect(correctTotal.kcal).not.toBe(buggyTotal.kcal);
  });

  it("quando os valores por refeição já são inteiros, os dois caminhos coincidem (o bug é sutil, não sempre visível)", () => {
    const rawMeals: MacroTotals[] = [meal(100, 5, 10, 2), meal(200, 10, 20, 4)];
    const buggyTotal = sumMacros(rawMeals.map((raw) => roundedMacros(raw)));
    const correctTotal = roundedMacros(sumMacros(rawMeals));
    expect(correctTotal.kcal).toBe(buggyTotal.kcal);
  });

  it("mealMacros (exibição por refeição) continua arredondado individualmente — só o TOTAL usa soma bruta", () => {
    const rawMeals: MacroTotals[] = [meal(100.4, 5.04, 10.04, 2.04), meal(50.6, 2.5, 5.5, 1.1)];
    const mealMacrosForDisplay = rawMeals.map((raw) => roundedMacros(raw));
    expect(mealMacrosForDisplay[0].kcal).toBe(100);
    expect(mealMacrosForDisplay[1].kcal).toBe(51);

    const planTotal = roundedMacros(sumMacros(rawMeals));
    expect(planTotal.kcal).toBe(Math.round(100.4 + 50.6));
  });
});
