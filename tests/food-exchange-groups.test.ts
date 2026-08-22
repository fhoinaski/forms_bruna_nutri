import { describe, expect, it } from "vitest";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";
import { classifyFoodExchangeGroup, isCompatibleForExchange } from "@/lib/nutrition/food-exchange-hierarchy";
import { generateExchangeGroupAlternatives, type ExchangeGroupCandidate } from "@/lib/nutrition/food-exchange-engine";

function find(descriptionIncludes: string) {
  const food = TACO_REFERENCES.find((f) => f.descricao.toLowerCase().includes(descriptionIncludes.toLowerCase()));
  if (!food) throw new Error(`fixture não encontrada: ${descriptionIncludes}`);
  return food;
}

const rice = find("arroz, tipo 1, cozido");
const potato = find("batata, inglesa, cozida");
const chicken = find("frango, peito, sem pele, cru");
const beef = find("carne, bovina, acém, sem gordura, cru");
const milk = find("leite, de vaca, integral");
const apple = find("maçã, fuji, com casca, crua");

describe("food-exchange-hierarchy — classificação determinística", () => {
  it("classifica arroz como CARBOHYDRATE/GRAIN", () => {
    const c = classifyFoodExchangeGroup(rice);
    expect(c.foodGroup).toBe("CARBOHYDRATE");
    expect(c.foodSubgroup).toBe("GRAIN");
  });

  it("classifica batata como CARBOHYDRATE/TUBER_ROOT (subgrupo diferente de arroz, mesmo grupo)", () => {
    const c = classifyFoodExchangeGroup(potato);
    expect(c.foodGroup).toBe("CARBOHYDRATE");
    expect(c.foodSubgroup).toBe("TUBER_ROOT");
  });

  it("classifica frango como PROTEIN/POULTRY, nunca RED_MEAT", () => {
    const c = classifyFoodExchangeGroup(chicken);
    expect(c.foodGroup).toBe("PROTEIN");
    expect(c.foodSubgroup).toBe("POULTRY");
  });

  it("classifica carne bovina como PROTEIN/RED_MEAT, distinto de frango", () => {
    const c = classifyFoodExchangeGroup(beef);
    expect(c.foodGroup).toBe("PROTEIN");
    expect(c.foodSubgroup).toBe("RED_MEAT");
  });

  it("classifica leite como DAIRY/MILK", () => {
    const c = classifyFoodExchangeGroup(milk);
    expect(c.foodGroup).toBe("DAIRY");
    expect(c.foodSubgroup).toBe("MILK");
  });

  it("classifica ovo de galinha como PROTEIN/EGG, nunca POULTRY (nome contém 'galinha' E 'ovo')", () => {
    const c = classifyFoodExchangeGroup({ descricao: "Ovo de galinha inteiro cozido", grupo: undefined, proteina_g: 0, carboidrato_g: 0, lipidios_g: 0 });
    expect(c.foodGroup).toBe("PROTEIN");
    expect(c.foodSubgroup).toBe("EGG");
  });

  it("continua classificando peito de galinha assado como POULTRY (sem 'ovo' no nome)", () => {
    const c = classifyFoodExchangeGroup({ descricao: "Peito de galinha assado", grupo: undefined, proteina_g: 0, carboidrato_g: 0, lipidios_g: 0 });
    expect(c.foodGroup).toBe("PROTEIN");
    expect(c.foodSubgroup).toBe("POULTRY");
  });

  it("classifica aveia em flocos como CARBOHYDRATE/GRAIN, nunca PROTEIN/POULTRY ('ave' é substring de 'aveia')", () => {
    const c = classifyFoodExchangeGroup({ descricao: "Aveia em flocos", grupo: undefined, proteina_g: 0, carboidrato_g: 0, lipidios_g: 0 });
    expect(c.foodGroup).toBe("CARBOHYDRATE");
    expect(c.foodSubgroup).toBe("GRAIN");
  });

  it("classifica maçã como FRUIT (via grupo TACO 'Frutas e derivados')", () => {
    const c = classifyFoodExchangeGroup(apple);
    expect(c.foodGroup).toBe("FRUIT");
  });

  it("nunca lança erro — qualquer alimento sem regra bate no fallback por macro (nunca 'unknown')", () => {
    const c = classifyFoodExchangeGroup({ descricao: "Substância nutricional hipotética xyz", grupo: undefined, proteina_g: 1, carboidrato_g: 1, lipidios_g: 90 });
    expect(["CARBOHYDRATE", "PROTEIN", "FAT", "OTHER"]).toContain(c.foodGroup);
  });
});

describe("isCompatibleForExchange — grupo é o primeiro filtro (item 4/18)", () => {
  const ricePrimary = classifyFoodExchangeGroup(rice);
  const potatoCandidate = classifyFoodExchangeGroup(potato);
  const chickenCandidate = classifyFoodExchangeGroup(chicken);

  it("mesmo subgrupo (arroz vs arroz de outra preparação) é compatível mesmo sem allowCrossGroup", () => {
    const result = isCompatibleForExchange(ricePrimary, ricePrimary, false);
    expect(result.compatible).toBe(true);
    expect(result.sameSubgroup).toBe(true);
  });

  it("mesmo grupo mas subgrupo diferente (arroz vs batata) é INCOMPATÍVEL por padrão (allowCrossGroup=false)", () => {
    const result = isCompatibleForExchange(ricePrimary, potatoCandidate, false);
    expect(result.compatible).toBe(false);
    expect(result.sameGroup).toBe(true);
    expect(result.sameSubgroup).toBe(false);
  });

  it("mesmo grupo, subgrupo diferente vira compatível quando allowCrossGroup=true", () => {
    const result = isCompatibleForExchange(ricePrimary, potatoCandidate, true);
    expect(result.compatible).toBe(true);
  });

  it("grupos totalmente diferentes (arroz vs frango) NUNCA são compatíveis, mesmo com allowCrossGroup=true", () => {
    const result = isCompatibleForExchange(ricePrimary, chickenCandidate, true);
    expect(result.compatible).toBe(false);
  });
});

describe("generateExchangeGroupAlternatives — motor determinístico (item 4/9/17/18)", () => {
  function candidateFrom(food: (typeof TACO_REFERENCES)[number]): ExchangeGroupCandidate {
    return { food, ref: { source: "TACO", sourceId: String(food.numero) } };
  }

  it("nunca sugere candidatos de grupo incompatível (frango não aparece como troca de arroz)", () => {
    const result = generateExchangeGroupAlternatives({
      primaryFood: rice,
      primaryRef: { source: "TACO", sourceId: String(rice.numero) },
      primaryGrams: 100,
      candidates: [candidateFrom(potato), candidateFrom(chicken), candidateFrom(beef)],
    });
    expect(result.alternatives.every((a) => a.food.descricao !== chicken.descricao)).toBe(true);
    expect(result.excludedByGroup).toBeGreaterThan(0);
  });

  it("nunca sugere o próprio alimento principal como alternativa dele mesmo", () => {
    const result = generateExchangeGroupAlternatives({
      primaryFood: rice,
      primaryRef: { source: "TACO", sourceId: String(rice.numero) },
      primaryGrams: 100,
      candidates: [candidateFrom(rice), candidateFrom(potato)],
      allowCrossGroup: true,
    });
    expect(result.alternatives.some((a) => a.ref.sourceId === String(rice.numero))).toBe(false);
  });

  it("restrição do paciente ELIMINA o candidato (nunca só reduz score)", () => {
    const withoutRestriction = generateExchangeGroupAlternatives({
      primaryFood: rice,
      primaryRef: { source: "TACO", sourceId: String(rice.numero) },
      primaryGrams: 100,
      candidates: [candidateFrom(potato)],
      allowCrossGroup: true,
    });
    expect(withoutRestriction.alternatives.length).toBeGreaterThan(0);

    const withRestriction = generateExchangeGroupAlternatives({
      primaryFood: rice,
      primaryRef: { source: "TACO", sourceId: String(rice.numero) },
      primaryGrams: 100,
      candidates: [candidateFrom(potato)],
      allowCrossGroup: true,
      isRestricted: (c) => c.ref.sourceId === String(potato.numero),
    });
    expect(withRestriction.alternatives.length).toBe(0);
    expect(withRestriction.excludedByRestriction).toBe(1);
  });

  it("toda alternativa nasce em estado SUGGESTED — nunca aprovada automaticamente", () => {
    const result = generateExchangeGroupAlternatives({
      primaryFood: rice,
      primaryRef: { source: "TACO", sourceId: String(rice.numero) },
      primaryGrams: 100,
      candidates: [candidateFrom(potato)],
      allowCrossGroup: true,
    });
    expect(result.alternatives.every((a) => a.state === "SUGGESTED")).toBe(true);
  });

  it("respeita o limite configurável de alternativas (item 10)", () => {
    const manyCandidates = TACO_REFERENCES.filter((f) => f.descricao.toLowerCase().includes("arroz")).map(candidateFrom);
    const result = generateExchangeGroupAlternatives({
      primaryFood: rice,
      primaryRef: { source: "TACO", sourceId: String(rice.numero) },
      primaryGrams: 100,
      candidates: manyCandidates,
      limit: 2,
    });
    expect(result.alternatives.length).toBeLessThanOrEqual(2);
  });
});

describe("grupos de troca nunca entram no total do plano (item 21 — prova estrutural)", () => {
  it("gerar um grupo de troca com alternativas de gramatura bem diferente do item base não muda calculatePlanNutrients — a função nem recebe exchange groups como argumento", async () => {
    const { calculatePlanNutrients } = await import("@/lib/nutrition/nutrients");
    const { resolveMealPlanChangeReferences, buildFoodReferenceLookup } = await import("@/lib/ai/agents/nutrition/meal-plan-change-agent");

    const plan = {
      meals: [
        {
          id: "meal-1",
          name: "Almoço",
          suggested_time: null,
          source_recipe_id: null,
          items: [{ id: "item-1", food: rice.descricao, quantity: "100", unit: "g", food_source: "TACO" as const, food_ref_id: String(rice.numero) }],
        },
      ],
    };

    const refs = await resolveMealPlanChangeReferences(plan);
    const totalBefore = calculatePlanNutrients(plan, buildFoodReferenceLookup(refs.references, refs.measuresById));

    // Gera um grupo de troca real, com uma alternativa de gramatura MUITO
    // diferente do item base — prova que essa geração/aprovação em memória
    // não tem NENHUM caminho pra alterar `plan` ou o resultado acima, já
    // que `calculatePlanNutrients` só aceita `meals` (grupos de troca vivem
    // em tabelas próprias, nunca embutidos no payload do plano).
    const generated = generateExchangeGroupAlternatives({
      primaryFood: rice,
      primaryRef: { source: "TACO", sourceId: String(rice.numero) },
      primaryGrams: 100,
      candidates: [{ food: potato, ref: { source: "TACO", sourceId: String(potato.numero) } }],
      allowCrossGroup: true,
    });
    expect(generated.alternatives.length).toBeGreaterThan(0);
    expect(generated.alternatives[0].quantityGrams).not.toBe(100);

    const totalAfter = calculatePlanNutrients(plan, buildFoodReferenceLookup(refs.references, refs.measuresById));
    expect(totalAfter.total.values).toEqual(totalBefore.total.values);
    expect(totalBefore.total.values.energyKcal).toBeGreaterThan(0);
  });
});
