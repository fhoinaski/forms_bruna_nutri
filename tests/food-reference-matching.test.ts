import { describe, expect, it } from "vitest";
import {
  findBestFoodReference,
  findFoodReferenceByIdentity,
  resolveFoodItemMacros,
  resolveFoodReference,
  type MacroReferenceFood,
} from "@/lib/nutrition/macros";
import type { HouseholdMeasureOption } from "@/lib/nutrition/quantity-resolution";

const arroz: MacroReferenceFood = { numero: 3, descricao: "Arroz, tipo 1, cozido", grupo: "Cereais", fonte: "taco", energia_kcal: 128, proteina_g: 2.5, carboidrato_g: 28, lipidios_g: 0.2 };
const arrozDoce: MacroReferenceFood = { numero: 9, descricao: "Arroz doce", grupo: "Doces", fonte: "taco", energia_kcal: 150, proteina_g: 3, carboidrato_g: 30, lipidios_g: 2 };
const sal: MacroReferenceFood = { numero: 500, descricao: "Sal", grupo: "Condimentos", fonte: "taco", energia_kcal: 0, proteina_g: 0, carboidrato_g: 0, lipidios_g: 0 };
const salsicha: MacroReferenceFood = { numero: 501, descricao: "Salsicha", grupo: "Carnes", fonte: "taco", energia_kcal: 250, proteina_g: 12, carboidrato_g: 2, lipidios_g: 20 };
const custom: MacroReferenceFood = { numero: "custom-1", descricao: "Granola da marca X", fonte: "custom", energia_kcal: 400, proteina_g: 10, carboidrato_g: 60, lipidios_g: 8 };
const references = [arroz, arrozDoce, sal, salsicha, custom];

describe("findBestFoodReference — ranking em 3 níveis, sem falso positivo por substring reversa", () => {
  it("prioriza match exato sobre começa-com e contém", () => {
    expect(findBestFoodReference("Arroz, tipo 1, cozido", references)?.numero).toBe(3);
  });

  it("usa começa-com quando não há exato, priorizando sobre 'contém' (mesmo quando 'contém' teria vindo primeiro na lista)", () => {
    const emptyGroup = { ...arroz, numero: 99, descricao: "Bolo de arroz", grupo: "Doces" }; // "contem" arroz, mas nao comeca com
    const pool = [emptyGroup, arrozDoce, arroz];
    // "arrozDoce" (numero 9) comeca-com "arroz" e tem distancia menor que "Bolo de arroz" (que so "contem") — comeca-com sempre vence contem, independente de posicao na lista.
    expect(findBestFoodReference("arroz", pool)?.numero).toBe(9);
  });

  it("nunca casa por 'o texto digitado contém a referência' (bug real corrigido: 'sal' não deve casar dentro de 'salsicha' quando o usuário digitou o texto errado)", () => {
    // Buscando literalmente "salsicha" deve achar salsicha, nao "sal" por causa da direcao removida.
    expect(findBestFoodReference("salsicha", references)?.numero).toBe(501);
    // Buscando "sal" deve achar sal (comeca-com), nao ser afetado pela remocao.
    expect(findBestFoodReference("sal", references)?.numero).toBe(500);
  });

  it("retorna null quando nada bate — nunca inventa um alimento", () => {
    expect(findBestFoodReference("alimento totalmente desconhecido xyz", references)).toBeNull();
  });
});

describe("findFoodReferenceByIdentity — vínculo estruturado, prioridade máxima", () => {
  it("resolve um alimento TACO pelo número, ignorando completamente o nome", () => {
    const found = findFoodReferenceByIdentity(references, "TACO", "3");
    expect(found?.descricao).toBe("Arroz, tipo 1, cozido");
  });

  it("resolve um alimento personalizado (CUSTOM) pelo id", () => {
    const found = findFoodReferenceByIdentity(references, "CUSTOM", "custom-1");
    expect(found?.descricao).toBe("Granola da marca X");
  });

  it("retorna null quando o id não existe — nunca inventa um alimento", () => {
    expect(findFoodReferenceByIdentity(references, "TACO", "99999")).toBeNull();
  });

  it("retorna null quando food_source/food_ref_id estão ausentes", () => {
    expect(findFoodReferenceByIdentity(references, null, null)).toBeNull();
    expect(findFoodReferenceByIdentity(references, "TACO", null)).toBeNull();
  });
});

describe("resolveFoodReference — uma vez vinculado, nunca mais depende do nome textual", () => {
  it("usa o vínculo estruturado mesmo quando o texto do alimento é enganoso/diferente", () => {
    // O texto diz "Salsicha" mas o vinculo estruturado aponta para arroz (numero 3) — o vinculo manda, nunca o texto.
    const resolved = resolveFoodReference({ food: "Salsicha", food_source: "TACO", food_ref_id: "3" }, references);
    expect(resolved?.descricao).toBe("Arroz, tipo 1, cozido");
  });

  it("sem vínculo, cai para o match textual (comportamento legado preservado)", () => {
    const resolved = resolveFoodReference({ food: "Sal", food_source: null, food_ref_id: null }, references);
    expect(resolved?.numero).toBe(500);
  });
});

describe("resolveFoodItemMacros — cálculo completo (macros + resolução de quantidade + vínculo)", () => {
  it("alimento não encontrado nunca inventa macros — reference null, macros zerados", () => {
    const result = resolveFoodItemMacros({ food: "Alimento inexistente xyz", quantity: "100", unit: "g" }, references);
    expect(result.reference).toBeNull();
    expect(result.macros.kcal).toBe(0);
    expect(result.macros.totalItems).toBe(1);
    expect(result.macros.recognizedItems).toBe(0);
  });

  it("food_reference_id válido não depende do matching textual, mesmo com nome livre enganoso", () => {
    const result = resolveFoodItemMacros({ food: "Texto qualquer digitado", food_source: "TACO", food_ref_id: "3", quantity: "100", unit: "g" }, references);
    expect(result.reference?.descricao).toBe("Arroz, tipo 1, cozido");
    expect(result.macros.kcal).toBeCloseTo(128, 3);
  });

  it("usa a medida caseira vinculada quando fornecida, refletindo no method/confidence da resolução", () => {
    const measure: HouseholdMeasureOption = { id: "m1", description: "1 unidade média", gramEquivalent: 86, source: "TBCA", confidence: "high" };
    const result = resolveFoodItemMacros(
      { food: "Arroz, tipo 1, cozido", food_source: "TACO", food_ref_id: "3", quantity: "1" },
      references,
      measure
    );
    expect(result.quantity.method).toBe("food_household_measure");
    expect(result.quantity.grams).toBe(86);
    expect(result.macros.kcal).toBeCloseTo((128 * 86) / 100, 3);
  });

  it("quantidade não resolvida (unidade desconhecida) nunca produz um macro inventado", () => {
    const result = resolveFoodItemMacros({ food: "Arroz, tipo 1, cozido", quantity: "2", unit: "porções" }, references);
    expect(result.quantity.method).toBe("unresolved");
    expect(result.macros.kcal).toBe(0);
    expect(result.macros.recognizedItems).toBe(1); // alimento foi reconhecido, so a quantidade que nao deu pra calcular
  });
});
