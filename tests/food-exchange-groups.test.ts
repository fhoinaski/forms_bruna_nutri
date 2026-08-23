import { describe, expect, it } from "vitest";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";
import { classifyFoodExchangeGroup, isCompatibleForExchange } from "@/lib/nutrition/food-exchange-hierarchy";
import { generateCuratedGlobalRankExchangeAlternatives, generateExchangeGroupAlternatives, generateHybridExchangeAlternatives, type ExchangeGroupCandidate } from "@/lib/nutrition/food-exchange-engine";

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

/**
 * CORREÇÃO P0 — bug real observado em produção: "Queijo minas frescal"
 * gerava "Queijo minas meia cura — 40g" E "Queijo minas meia cura — 45g"
 * como DUAS alternativas (dados combinados de taco.json + taco-
 * complementar.json têm uma linha cada pro mesmo alimento real). Testes
 * contra o dataset TACO real (nunca fixtures sintéticas) — o bug só
 * aparecia com dados reais, um teste com 2-3 candidatos inventados nunca
 * teria pegado isso.
 */
describe("generateExchangeGroupAlternatives — qualidade das sugestões contra dados reais (CORREÇÃO P0)", () => {
  function candidateFrom(food: (typeof TACO_REFERENCES)[number]): ExchangeGroupCandidate {
    return { food, ref: { source: "TACO", sourceId: String(food.numero) } };
  }

  function allCandidatesExcept(primaryNumero: number | string | undefined) {
    return TACO_REFERENCES.filter((f) => f.numero !== primaryNumero).map(candidateFrom);
  }

  function normalizedIdentity(descricao: string): string {
    return descricao
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  it("queijo minas frescal: nenhuma duplicata semântica no top 5 (o bug real reportado)", () => {
    const cheese = find("queijo, minas, frescal");
    const result = generateExchangeGroupAlternatives({
      primaryFood: cheese,
      primaryRef: { source: "TACO", sourceId: String(cheese.numero) },
      primaryGrams: 50,
      candidates: allCandidatesExcept(cheese.numero),
      limit: 5,
    });
    const identities = result.alternatives.map((a) => normalizedIdentity(a.food.descricao));
    expect(new Set(identities).size).toBe(identities.length);
    // "Queijo, minas, meia cura" (numero 462) e "Queijo minas, meia cura"
    // (numero 1043, TACO complementar) são o MESMO alimento real — só um
    // dos dois pode aparecer.
    const minasMeiaCuraCount = result.alternatives.filter((a) => /minas.*meia cura/i.test(a.food.descricao)).length;
    expect(minasMeiaCuraCount).toBeLessThanOrEqual(1);
  });

  it("queijo minas frescal: nunca inclui prato composto que só CONTÉM queijo no nome (ex.: 'Pão, de queijo')", () => {
    const cheese = find("queijo, minas, frescal");
    const result = generateExchangeGroupAlternatives({
      primaryFood: cheese,
      primaryRef: { source: "TACO", sourceId: String(cheese.numero) },
      primaryGrams: 50,
      candidates: allCandidatesExcept(cheese.numero),
      limit: 10,
      allowCrossGroup: true,
    });
    expect(result.alternatives.some((a) => /^p[aã]o,?\s*de\s*queijo/i.test(a.food.descricao))).toBe(false);
  });

  it("queijo minas frescal: todo candidato do top 5 é DAIRY/CHEESE (grupo/subgrupo corretos, nunca por kcal isolado)", () => {
    const cheese = find("queijo, minas, frescal");
    const result = generateExchangeGroupAlternatives({
      primaryFood: cheese,
      primaryRef: { source: "TACO", sourceId: String(cheese.numero) },
      primaryGrams: 50,
      candidates: allCandidatesExcept(cheese.numero),
      limit: 5,
    });
    expect(result.alternatives.length).toBeGreaterThan(0);
    for (const alt of result.alternatives) {
      expect(classifyFoodExchangeGroup(alt.food).foodGroup).toBe("DAIRY");
    }
  });

  it("batata doce: candidatos vêm do grupo de carboidratos/tubérculos, nunca de outro grupo por acaso", () => {
    const sweetPotato = find("batata, doce, cozida");
    const result = generateExchangeGroupAlternatives({
      primaryFood: sweetPotato,
      primaryRef: { source: "TACO", sourceId: String(sweetPotato.numero) },
      primaryGrams: 150,
      candidates: allCandidatesExcept(sweetPotato.numero),
      limit: 5,
    });
    expect(result.alternatives.length).toBeGreaterThan(0);
    for (const alt of result.alternatives) {
      expect(classifyFoodExchangeGroup(alt.food).foodGroup).toBe("CARBOHYDRATE");
    }
  });

  it("tilápia (peixe): candidatos são proteicos, nunca 5 registros do mesmo peixe de fontes diferentes", () => {
    const fish = TACO_REFERENCES.find((f) => /tilapia/i.test(f.descricao) || /merluza,?\s*fil[eé],?\s*cru/i.test(f.descricao))!;
    const result = generateExchangeGroupAlternatives({
      primaryFood: fish,
      primaryRef: { source: "TACO", sourceId: String(fish.numero) },
      primaryGrams: 120,
      candidates: allCandidatesExcept(fish.numero),
      limit: 5,
    });
    expect(result.alternatives.length).toBeGreaterThan(0);
    for (const alt of result.alternatives) {
      expect(classifyFoodExchangeGroup(alt.food).foodGroup).toBe("PROTEIN");
    }
    const identities = result.alternatives.map((a) => normalizedIdentity(a.food.descricao));
    expect(new Set(identities).size).toBe(identities.length);
  });

  it("banana: candidatos são frutas, nunca 5 cultivares de banana ocupando o top 5 inteiro", () => {
    const banana = find("banana, prata, crua");
    const result = generateExchangeGroupAlternatives({
      primaryFood: banana,
      primaryRef: { source: "TACO", sourceId: String(banana.numero) },
      primaryGrams: 80,
      candidates: allCandidatesExcept(banana.numero),
      limit: 5,
    });
    expect(result.alternatives.length).toBeGreaterThan(0);
    for (const alt of result.alternatives) {
      expect(classifyFoodExchangeGroup(alt.food).foodGroup).toBe("FRUIT");
    }
    const bananaVariantCount = result.alternatives.filter((a) => /banana/i.test(a.food.descricao)).length;
    expect(bananaVariantCount).toBeLessThanOrEqual(2);
  });

  it("similaridade de nome NUNCA vence incompatibilidade de grupo: 'queijo prato' não substitui arroz mesmo com kcal parecido", () => {
    const cheesePlate = TACO_REFERENCES.find((f) => /queijo,?\s*prato/i.test(f.descricao))!;
    const result = generateExchangeGroupAlternatives({
      primaryFood: rice,
      primaryRef: { source: "TACO", sourceId: String(rice.numero) },
      primaryGrams: 100,
      candidates: [candidateFrom(cheesePlate), candidateFrom(potato)],
    });
    expect(result.alternatives.some((a) => a.food.descricao === cheesePlate.descricao)).toBe(false);
  });

  it("pão integral: same subgroup é evidência, mas não regra absoluta de topo", () => {
    const bread = find("pão, trigo, forma, integral");
    const result = generateExchangeGroupAlternatives({
      primaryFood: bread,
      primaryRef: { source: "TACO", sourceId: String(bread.numero) },
      primaryGrams: 50,
      candidates: allCandidatesExcept(bread.numero),
      limit: 5,
    });
    expect(result.alternatives.length).toBeGreaterThan(3);
    expect(result.alternatives.every((alt) => alt.sameGroup)).toBe(true);
    expect(new Set(result.alternatives.map((alt) => alt.familyKey)).size).toBe(result.alternatives.length);
  });

  it("arroz integral no almoço: sugere amidos de refeição principal e bloqueia pão/farinha/cereal infantil", () => {
    const brownRice = TACO_REFERENCES.find((f) => /arroz,?\s*integral,?\s*cozido/i.test(f.descricao)) ?? rice;
    const result = generateExchangeGroupAlternatives({
      primaryFood: brownRice,
      primaryRef: { source: "TACO", sourceId: String(brownRice.numero) },
      primaryGrams: 120,
      candidates: allCandidatesExcept(brownRice.numero),
      mealName: "Almoço",
      limit: 5,
    });
    expect(result.alternatives.length).toBeGreaterThan(0);
    const names = result.alternatives.map((a) => a.food.descricao.toLowerCase());
    expect(names.some((name) => /batata|mandioca|inhame|cuscuz|macarr[aã]o|massa|quinoa|arroz/.test(name))).toBe(true);
    expect(names.some((name) => /p[aã]o|farinha|cereal infantil|mingau|biscoito|bolo/.test(name))).toBe(false);
    expect(result.alternatives.every((alt) => alt.contextAppropriate && alt.culinaryRole === "STARCH_MAIN")).toBe(true);
  });

  it("pão integral no café: diversifica a função de carboidrato, não fica preso a 5 pães", () => {
    const bread = find("pão, trigo, forma, integral");
    const result = generateExchangeGroupAlternatives({
      primaryFood: bread,
      primaryRef: { source: "TACO", sourceId: String(bread.numero) },
      primaryGrams: 50,
      candidates: allCandidatesExcept(bread.numero),
      mealName: "Café da manhã",
      limit: 5,
    });
    expect(result.alternatives.length).toBeGreaterThan(2);
    const names = result.alternatives.map((a) => a.food.descricao.toLowerCase());
    const breadCount = names.filter((name) => /p[aã]o/.test(name)).length;
    expect(breadCount).toBeLessThanOrEqual(2);
    expect(names.some((name) => /tapioca|cuscuz|aveia|torrada/.test(name))).toBe(true);
    expect(result.alternatives.every((alt) => alt.contextAppropriate)).toBe(true);
  });

  it("banana no café/lanche: diversifica frutas e não retorna 5 cultivares de banana", () => {
    const banana = find("banana, prata, crua");
    const result = generateExchangeGroupAlternatives({
      primaryFood: banana,
      primaryRef: { source: "TACO", sourceId: String(banana.numero) },
      primaryGrams: 80,
      candidates: allCandidatesExcept(banana.numero),
      mealName: "Lanche da tarde",
      limit: 5,
    });
    expect(result.alternatives.length).toBeGreaterThan(0);
    const names = result.alternatives.map((a) => a.food.descricao.toLowerCase());
    expect(result.alternatives.every((alt) => classifyFoodExchangeGroup(alt.food).foodGroup === "FRUIT")).toBe(true);
    expect(result.alternatives.every((alt) => !["JUICE", "PRESERVED_FRUIT", "DESSERT"].includes(alt.foodForm))).toBe(true);
    expect(names.filter((name) => /banana/.test(name)).length).toBeLessThanOrEqual(1);
    expect(new Set(result.alternatives.map((a) => a.familyKey)).size).toBe(result.alternatives.length);
  });

  it("frango no almoço: prioriza proteína principal e não sugere ovo/queijo/suplemento", () => {
    const cookedChicken = TACO_REFERENCES.find((f) => /frango,?\s*peito.*grelhado/i.test(f.descricao)) ?? chicken;
    const result = generateExchangeGroupAlternatives({
      primaryFood: cookedChicken,
      primaryRef: { source: "TACO", sourceId: String(cookedChicken.numero) },
      primaryGrams: 120,
      candidates: allCandidatesExcept(cookedChicken.numero),
      mealName: "Almoço",
      limit: 5,
    });
    expect(result.alternatives.length).toBeGreaterThan(0);
    const names = result.alternatives.map((a) => a.food.descricao.toLowerCase());
    expect(names.some((name) => /peixe|til[aá]pia|merluza|pescada|carne|bovina|lombo|frango|peru/.test(name))).toBe(true);
    expect(names.some((name) => /ovo|queijo|whey|suplemento/.test(name))).toBe(false);
    expect(result.alternatives.every((alt) => alt.contextAppropriate && alt.culinaryRole === "LEAN_PROTEIN_MAIN")).toBe(true);
  });

  it("hybrid curated-first: usa candidatos da lista curada antes do fallback automático", () => {
    const brownRice = TACO_REFERENCES.find((f) => /arroz,?\s*integral,?\s*cozido/i.test(f.descricao)) ?? rice;
    const curatedFoods = ["arroz, tipo 1, cozido", "batata, doce, cozida", "mandioca, cozida", "cuscuz, de milho, cozido"]
      .map((name) => candidateFrom(find(name)));
    const result = generateHybridExchangeAlternatives({
      primaryFood: brownRice,
      primaryRef: { source: "TACO", sourceId: String(brownRice.numero) },
      primaryGrams: 120,
      curatedCandidates: curatedFoods,
      automaticCandidates: allCandidatesExcept(brownRice.numero),
      curatedOrigin: "CURATED_CONTEXT_LIST",
      mealName: "Almoço",
      limit: 2,
    });
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.alternatives.every((alt) => alt.candidateOrigin === "CURATED_CONTEXT_LIST")).toBe(true);
    expect(result.alternatives.some((alt) => /batata|mandioca|cuscuz|arroz/i.test(alt.food.descricao))).toBe(true);
  });

  it("hybrid fallback: complementa com engine atual quando lista curada tem poucas opções boas", () => {
    const brownRice = TACO_REFERENCES.find((f) => /arroz,?\s*integral,?\s*cozido/i.test(f.descricao)) ?? rice;
    const result = generateHybridExchangeAlternatives({
      primaryFood: brownRice,
      primaryRef: { source: "TACO", sourceId: String(brownRice.numero) },
      primaryGrams: 120,
      curatedCandidates: [candidateFrom(find("batata, inglesa, cozida"))],
      automaticCandidates: allCandidatesExcept(brownRice.numero),
      curatedOrigin: "CURATED_TEMPLATE_LIST",
      mealName: "Almoço",
      limit: 5,
    });
    expect(result.alternatives.some((alt) => alt.candidateOrigin === "CURATED_TEMPLATE_LIST")).toBe(true);
    expect(result.alternatives.some((alt) => alt.candidateOrigin === "AUTOMATIC_ENGINE")).toBe(true);
    expect(new Set(result.alternatives.map((alt) => `${alt.ref.source}:${alt.ref.sourceId}`)).size).toBe(result.alternatives.length);
  });

  it("global rank: candidato curado não vence automaticamente candidato automático com equivalência melhor", () => {
    const brownRice = TACO_REFERENCES.find((f) => /arroz,?\s*integral,?\s*cozido/i.test(f.descricao)) ?? rice;
    const result = generateCuratedGlobalRankExchangeAlternatives({
      primaryFood: brownRice,
      primaryRef: { source: "TACO", sourceId: String(brownRice.numero) },
      primaryGrams: 120,
      curatedCandidates: [candidateFrom(find("cuscuz, de milho, cozido"))],
      automaticCandidates: allCandidatesExcept(brownRice.numero),
      curatedOrigin: "CURATED_CONTEXT_LIST",
      mealName: "Almoço",
      limit: 5,
    });
    expect(result.alternatives[0]?.candidateOrigin).toBe("AUTOMATIC_ENGINE");
    expect(result.alternatives.some((alt) => alt.candidateOrigin === "CURATED_CONTEXT_LIST")).toBe(true);
  });

  it("global rank: candidato curado ruim é rejeitado por qualidade/contexto", () => {
    const brownRice = TACO_REFERENCES.find((f) => /arroz,?\s*integral,?\s*cozido/i.test(f.descricao)) ?? rice;
    const cake = TACO_REFERENCES.find((f) => /bolo/i.test(f.descricao))!;
    const result = generateCuratedGlobalRankExchangeAlternatives({
      primaryFood: brownRice,
      primaryRef: { source: "TACO", sourceId: String(brownRice.numero) },
      primaryGrams: 120,
      curatedCandidates: [candidateFrom(cake)],
      automaticCandidates: allCandidatesExcept(brownRice.numero),
      curatedOrigin: "CURATED_CONTEXT_LIST",
      mealName: "Almoço",
      limit: 5,
    });
    expect(result.alternatives.some((alt) => alt.ref.sourceId === String(cake.numero))).toBe(false);
    expect(result.alternatives.every((alt) => alt.displayQuality !== "LOW" && alt.quality !== "UNSUITABLE")).toBe(true);
  });

  it("global rank: contexto muda o resultado de carboidrato entre almoço e café", () => {
    const bread = find("pão, trigo, forma, integral");
    const lunch = generateCuratedGlobalRankExchangeAlternatives({
      primaryFood: bread,
      primaryRef: { source: "TACO", sourceId: String(bread.numero) },
      primaryGrams: 50,
      curatedCandidates: [candidateFrom(find("batata, inglesa, cozida"))],
      automaticCandidates: allCandidatesExcept(bread.numero),
      curatedOrigin: "CURATED_CONTEXT_LIST",
      mealName: "Almoço",
      limit: 5,
    });
    const breakfast = generateCuratedGlobalRankExchangeAlternatives({
      primaryFood: bread,
      primaryRef: { source: "TACO", sourceId: String(bread.numero) },
      primaryGrams: 50,
      curatedCandidates: [candidateFrom(find("torrada, pão francês")), candidateFrom(find("aveia, flocos, crua"))],
      automaticCandidates: allCandidatesExcept(bread.numero),
      curatedOrigin: "CURATED_CONTEXT_LIST",
      mealName: "Café da manhã",
      limit: 5,
    });
    expect(lunch.alternatives.map((alt) => alt.food.descricao)).not.toEqual(breakfast.alternatives.map((alt) => alt.food.descricao));
    expect(breakfast.alternatives.every((alt) => alt.contextAppropriate)).toBe(true);
  });

  it("global rank: aplica diversidade com no máximo 2 alternativas por família e não retorna LOW", () => {
    const banana = find("banana, prata, crua");
    const result = generateCuratedGlobalRankExchangeAlternatives({
      primaryFood: banana,
      primaryRef: { source: "TACO", sourceId: String(banana.numero) },
      primaryGrams: 80,
      curatedCandidates: TACO_REFERENCES.filter((f) => /banana/i.test(f.descricao)).map(candidateFrom),
      automaticCandidates: allCandidatesExcept(banana.numero),
      curatedOrigin: "CURATED_CONTEXT_LIST",
      mealName: "Lanche da tarde",
      limit: 5,
    });
    for (const family of new Set(result.alternatives.map((alt) => alt.familyKey))) {
      expect(result.alternatives.filter((alt) => alt.familyKey === family).length).toBeLessThanOrEqual(2);
    }
    expect(result.alternatives.every((alt) => alt.displayQuality !== "LOW" && alt.quality !== "UNSUITABLE")).toBe(true);
  });

  it("same subgroup aparece antes de same group quando cross-group é permitido", () => {
    const bread = find("pão, trigo, forma, integral");
    const potato = find("batata, inglesa, cozida");
    const result = generateExchangeGroupAlternatives({
      primaryFood: rice,
      primaryRef: { source: "TACO", sourceId: String(rice.numero) },
      primaryGrams: 100,
      candidates: [candidateFrom(potato), candidateFrom(bread)],
      allowCrossGroup: true,
      limit: 2,
    });
    expect(result.alternatives.map((alt) => alt.relationCategory)).toEqual(["SAME_SUBGROUP", "SAME_GROUP"]);
  });

  it("alternativas LOW não aparecem automaticamente", () => {
    const result = generateExchangeGroupAlternatives({
      primaryFood: rice,
      primaryRef: { source: "TACO", sourceId: String(rice.numero) },
      primaryGrams: 100,
      candidates: allCandidatesExcept(rice.numero),
      allowCrossGroup: true,
      limit: 10,
    });
    expect(result.alternatives.every((alt) => alt.displayQuality !== "LOW" && alt.quality !== "UNSUITABLE")).toBe(true);
  });

  it("top 3 respeita diversidade: no máximo 2 alternativas da mesma família", () => {
    const banana = find("banana, prata, crua");
    const result = generateExchangeGroupAlternatives({
      primaryFood: banana,
      primaryRef: { source: "TACO", sourceId: String(banana.numero) },
      primaryGrams: 80,
      candidates: allCandidatesExcept(banana.numero),
      limit: 5,
    });
    const top3Families = result.alternatives.slice(0, 3).map((alt) => alt.familyKey);
    for (const family of new Set(top3Families)) {
      expect(top3Families.filter((item) => item === family).length).toBeLessThanOrEqual(2);
    }
  });

  it("uma alternativa = uma quantidade otimizada (nunca o mesmo candidato aparece 2x com gramaturas diferentes)", () => {
    const cheese = find("queijo, minas, frescal");
    const result = generateExchangeGroupAlternatives({
      primaryFood: cheese,
      primaryRef: { source: "TACO", sourceId: String(cheese.numero) },
      primaryGrams: 50,
      candidates: allCandidatesExcept(cheese.numero),
      limit: 10,
    });
    const refKeys = result.alternatives.map((a) => `${a.ref.source}:${a.ref.sourceId}`);
    expect(new Set(refKeys).size).toBe(refKeys.length);
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
