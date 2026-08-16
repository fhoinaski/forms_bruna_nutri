import { describe, expect, it } from "vitest";
import { resolveFoodSubstitution } from "@/lib/nutrition/food-substitution";
import { findBestTacoFood } from "@/lib/nutrition/taco";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import type { HouseholdMeasureOption } from "@/lib/nutrition/quantity-resolution";

/**
 * Killer Feature 4 — motor puro de substituicao (PASSO 2 do pedido). Cobre
 * os 4 status possiveis; o cenario mais critico e "SECURITY" no final:
 * mesmo que o input pareca vir de um LLM tentando forcar uma quantidade,
 * a funcao nunca aceita um numero pronto — so recalcula a partir de
 * quantidade+alimento, nunca de um valor "sugerido" externo (nao existe
 * nem parametro para isso na assinatura).
 */

const arroz = findBestTacoFood("Arroz, tipo 1, cozido")!;
const batata = findBestTacoFood("Batata, inglesa, cozida")!;

const base: MacroReferenceFood = { numero: "base", descricao: "Alimento base", grupo: "X", fonte: "custom", energia_kcal: 130, proteina_g: 2.5, carboidrato_g: 28, lipidios_g: 0.2 };
const target: MacroReferenceFood = { numero: "target", descricao: "Alimento destino", grupo: "X", fonte: "custom", energia_kcal: 77, proteina_g: 2, carboidrato_g: 17, lipidios_g: 0.1 };
const otherTarget: MacroReferenceFood = { numero: "target2", descricao: "Outro alimento destino", grupo: "X", fonte: "custom", energia_kcal: 90, proteina_g: 1.5, carboidrato_g: 20, lipidios_g: 0.1 };

describe("resolveFoodSubstitution — SAFE", () => {
  it("arroz -> batata: calcula gramatura a partir só da engine, nunca de um número externo", () => {
    const result = resolveFoodSubstitution({
      sourceFood: arroz,
      sourceQuantity: "100",
      sourceUnit: "g",
      targetCandidates: [batata],
    });
    expect(result.status).toBe("safe");
    if (result.status === "safe") {
      expect(result.sourceFoodName).toMatch(/arroz/i);
      expect(result.targetFoodName).toMatch(/batata/i);
      expect(result.sourceQuantity).toBe(100);
      expect(result.targetQuantity).toBeGreaterThan(0);
      expect(result.equivalenceBasis).toBe("energyKcal");
      expect(Math.abs(result.deltaPercent)).toBeLessThanOrEqual(15);
    }
  });

  it("usa medida caseira vinculada quando presente, com prioridade sobre a unidade em texto", () => {
    const measure: HouseholdMeasureOption = { id: "m1", description: "1 unidade média", gramEquivalent: 130, confidence: "high" };
    const result = resolveFoodSubstitution({
      sourceFood: base,
      sourceQuantity: "1",
      sourceUnit: "unidade",
      sourceHouseholdMeasure: measure,
      targetCandidates: [target],
    });
    expect(result.status).toBe("safe");
    if (result.status === "safe") expect(result.sourceQuantity).toBe(130);
  });

  it("quantidade calculada bate exatamente com o que findEquivalentFoods produziria (mesma engine, sem duplicar lógica)", () => {
    // base: 100g @ 130 kcal/100g = 130 kcal. target: 77 kcal/100g -> 130/77*100 ≈ 168.8g, arredondado p/ 5g -> 170g.
    const result = resolveFoodSubstitution({ sourceFood: base, sourceQuantity: "100", sourceUnit: "g", targetCandidates: [target] });
    expect(result.status).toBe("safe");
    if (result.status === "safe") expect(result.targetQuantity).toBe(170);
  });
});

describe("resolveFoodSubstitution — AMBIGUIDADE", () => {
  it("dois ou mais candidatos de destino -> ambiguous, nunca escolhe um sozinho", () => {
    const result = resolveFoodSubstitution({ sourceFood: base, sourceQuantity: "100", sourceUnit: "g", targetCandidates: [target, otherTarget] });
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates.map((c) => c.name)).toEqual(["Alimento destino", "Outro alimento destino"]);
    }
  });
});

describe("resolveFoodSubstitution — INVALID / NOT_SUPPORTED", () => {
  it("alimento de destino inexistente (0 candidatos) -> not_supported", () => {
    const result = resolveFoodSubstitution({ sourceFood: base, sourceQuantity: "100", sourceUnit: "g", targetCandidates: [] });
    expect(result.status).toBe("not_supported");
  });

  it("quantidade ausente -> not_supported, nunca inventa uma quantidade padrão", () => {
    const result = resolveFoodSubstitution({ sourceFood: base, sourceQuantity: null, sourceUnit: "g", targetCandidates: [target] });
    expect(result.status).toBe("not_supported");
  });

  it("unidade não reconhecida (não convertível) -> not_supported", () => {
    const result = resolveFoodSubstitution({ sourceFood: base, sourceQuantity: "2", sourceUnit: "sacola", targetCandidates: [target] });
    expect(result.status).toBe("not_supported");
  });

  it("plano/alimento base sem dado nutricional suficiente -> requires_review, nunca um resultado forçado", () => {
    const traceEnergy: MacroReferenceFood = { numero: "trace", descricao: "Quase sem energia", grupo: "X", fonte: "custom", energia_kcal: 1, proteina_g: 0, carboidrato_g: 0, lipidios_g: 0 };
    const result = resolveFoodSubstitution({ sourceFood: traceEnergy, sourceQuantity: "100", sourceUnit: "g", targetCandidates: [target], tolerancePercent: 5 });
    expect(result.status).toBe("requires_review");
  });
});

describe("resolveFoodSubstitution — CLÍNICO/BAIXA CONFIANÇA", () => {
  it("quantidade estimada por conversão genérica (baixa confiança) -> requires_review, nunca calcula em cima de um chute", () => {
    const result = resolveFoodSubstitution({ sourceFood: arroz, sourceQuantity: "2", sourceUnit: "colher", targetCandidates: [batata] });
    expect(result.status).toBe("requires_review");
  });
});

describe("resolveFoodSubstitution — SECURITY (teste crítico contra alucinação, seção 20 do pedido)", () => {
  it("a assinatura da função não aceita nenhum campo de 'quantidade sugerida' — estruturalmente impossível injetar um número pronto", () => {
    // Não existe `suggestedQuantity`/`targetQuantity` no ResolveFoodSubstitutionInput —
    // a única forma de influenciar o resultado é via os alimentos/quantidade
    // reais, nunca um valor calculado por fora. Este teste documenta essa
    // garantia estrutural: mesmo se um objeto com campos extras for passado
    // (ex.: um LLM tentando "vazar" um número por um campo desconhecido),
    // TypeScript nem compila um campo fora do schema, e em runtime campos
    // extras são simplesmente ignorados — o resultado abaixo prova que o
    // valor final SÓ pode vir do cálculo real contra `target`.
    const attemptedInjection = {
      sourceFood: base,
      sourceQuantity: "100",
      sourceUnit: "g",
      targetCandidates: [target],
      // Campo forjado, não faz parte do tipo — TS rejeitaria isso em uso
      // tipado normal; simulando aqui um payload solto (ex.: JSON de uma
      // tool call de LLM comprometida) que tenta se passar por parte do input.
      targetQuantity: 999,
      suggestedQuantityG: 999,
    };
    const result = resolveFoodSubstitution(attemptedInjection);
    expect(result.status).toBe("safe");
    if (result.status === "safe") {
      expect(result.targetQuantity).not.toBe(999);
      expect(result.targetQuantity).toBe(170); // mesmo valor determinístico do teste de cima — a engine ignorou os campos forjados
    }
  });
});
