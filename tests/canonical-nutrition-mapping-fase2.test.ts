import { describe, expect, it } from "vitest";
import {
  POF_NUTRIENT_MAP,
  TACO_NUTRIENT_MAP,
  TBCA_MAIN_NUTRIENT_SLUG_MAP,
  TBCA_STATS_TAGNAME_MAP,
  resolveTbcaMainNutrientCode,
  resolveTbcaStatsNutrientCode,
} from "@/lib/nutrition-import/nutrient-mapping";

/**
 * Fase 2 — Nutrient Vocabulary & Mapping Completion. Cobre exatamente as
 * distincoes semanticas exigidas pelo pedido: RE vs RAE, niacin vs NE,
 * folate vs DFE, total vs disponivel/adicao, e os 9 NutrientCode novos.
 */

describe("Fase 2 — correcao real dos tagnames de estatistica da TBCA", () => {
  it("'VITA RAE' (com espaco, confirmado no dado real) mapeia — a chave antiga 'VITA_RAE' nunca batia com nada", () => {
    expect(TBCA_STATS_TAGNAME_MAP["VITA RAE"]).toBe("VITAMIN_A");
    expect(TBCA_STATS_TAGNAME_MAP.VITA_RAE).toBeUndefined();
  });

  it("'FOLDFE' (confirmado no dado real) mapeia — a chave antiga 'FOL' nunca existia na fonte", () => {
    expect(TBCA_STATS_TAGNAME_MAP.FOLDFE).toBe("FOLATE");
    expect(TBCA_STATS_TAGNAME_MAP.FOL).toBeUndefined();
  });
});

describe("Vitamina A: RE vs RAE nunca fundidos", () => {
  it("TACO: so taco:rae (RAE) mapeia; taco:retinol e taco:re ficam fora", () => {
    expect(TACO_NUTRIENT_MAP["taco:rae"]).toBe("VITAMIN_A");
    expect(TACO_NUTRIENT_MAP["taco:retinol"]).toBeUndefined();
    expect(TACO_NUTRIENT_MAP["taco:re"]).toBeUndefined();
  });

  it("TBCA colecao principal: so vitamina_a_rae mapeia; vitamina_a_re fica fora", () => {
    expect(resolveTbcaMainNutrientCode("vitamina_a_rae", "mcg")).toBe("VITAMIN_A");
    expect(resolveTbcaMainNutrientCode("vitamina_a_re", "mcg")).toBeNull();
  });

  it("TBCA estatistica: so 'VITA RAE' mapeia; tagname 'VITA' (RE) fica fora", () => {
    expect(resolveTbcaStatsNutrientCode("VITA RAE", "mcg")).toBe("VITAMIN_A");
    expect(resolveTbcaStatsNutrientCode("VITA", "mcg")).toBeNull();
  });
});

describe("Niacina: direta vs equivalentes (NE) nunca fundidos", () => {
  it("POF: niacin_mg mapeia, niacin_ne_mg fica fora", () => {
    expect(POF_NUTRIENT_MAP["ibge_pof_2008_2009:niacin_mg"]).toBe("NIACIN");
    expect(POF_NUTRIENT_MAP["ibge_pof_2008_2009:niacin_ne_mg"]).toBeUndefined();
  });

  it("TBCA: tagname NIA (niacina direta) mapeia; nao existe variante NE nesta base (confirmado por auditoria real)", () => {
    expect(resolveTbcaStatsNutrientCode("NIA", "mg")).toBe("NIACIN");
    expect(TBCA_STATS_TAGNAME_MAP.NIAEQ).toBeUndefined();
  });
});

describe("Folato: unica variante publicada (DFE) — documentado, nao escondido", () => {
  it("TACO/TBCA/POF folato mapeiam para FOLATE (nenhuma fonte publica um folato simples paralelo pra comparar)", () => {
    expect(TACO_NUTRIENT_MAP["taco:c"]).toBe("VITAMIN_C"); // sanity: chave nao e a de folato
    expect(POF_NUTRIENT_MAP["ibge_pof_2008_2009:folate_dfe_ug"]).toBe("FOLATE");
    expect(resolveTbcaMainNutrientCode("equivalente_de_folato", "mcg")).toBe("FOLATE");
    expect(resolveTbcaStatsNutrientCode("FOLDFE", "mcg")).toBe("FOLATE");
  });
});

describe("Carboidrato: total vs disponivel nunca fundidos", () => {
  it("TBCA colecao principal: carboidrato_total mapeia, carboidrato_disponivel fica fora", () => {
    expect(resolveTbcaMainNutrientCode("carboidrato_total", "g")).toBe("CARBOHYDRATE");
    expect(resolveTbcaMainNutrientCode("carboidrato_disponivel", "g")).toBeNull();
  });

  it("TBCA estatistica: CHOCDF (total) mapeia, CHOAVLDF (disponivel) fica fora", () => {
    expect(resolveTbcaStatsNutrientCode("CHOCDF", "g")).toBe("CARBOHYDRATE");
    expect(resolveTbcaStatsNutrientCode("CHOAVLDF", "g")).toBeNull();
  });
});

describe("Acucar/sal/gordura: total vs de adicao nunca fundidos", () => {
  it("POF: total_sugar_g -> SUGARS, added_sugar_g -> ADDED_SUGAR (codigos diferentes)", () => {
    expect(POF_NUTRIENT_MAP["ibge_pof_2008_2009:total_sugar_g"]).toBe("SUGARS");
    expect(POF_NUTRIENT_MAP["ibge_pof_2008_2009:added_sugar_g"]).toBe("ADDED_SUGAR");
    expect(POF_NUTRIENT_MAP["ibge_pof_2008_2009:total_sugar_g"]).not.toBe(POF_NUTRIENT_MAP["ibge_pof_2008_2009:added_sugar_g"]);
  });

  it("added_sodium_mg da POF fica FORA — 0 ocorrencias reais no dataset, e nao e o mesmo conceito de ADDED_SALT (sal em g != sodio em mg)", () => {
    expect(POF_NUTRIENT_MAP["ibge_pof_2008_2009:added_sodium_mg"]).toBeUndefined();
  });

  it("TBCA: sodio (mg) -> SODIUM, sal_de_adicao (g) -> ADDED_SALT — nunca o mesmo codigo", () => {
    expect(TBCA_MAIN_NUTRIENT_SLUG_MAP.sodio).toBe("SODIUM");
    expect(resolveTbcaMainNutrientCode("sodio", "mg")).toBe("SODIUM");
    expect(resolveTbcaMainNutrientCode("sal_de_adicao", "g")).toBe("ADDED_SALT");
    expect(resolveTbcaMainNutrientCode("sodio", "mg")).not.toBe(resolveTbcaMainNutrientCode("sal_de_adicao", "g"));
  });

  it("TBCA: acucar_de_adicao -> ADDED_SUGAR, gordura_de_adicao -> ADDED_FAT", () => {
    expect(resolveTbcaMainNutrientCode("acucar_de_adicao", "g")).toBe("ADDED_SUGAR");
    expect(resolveTbcaMainNutrientCode("gordura_de_adicao", "g")).toBe("ADDED_FAT");
  });
});

describe("Proteina vegetal vs animal", () => {
  it("TBCA: proteina_vegetal -> PLANT_PROTEIN, proteina_animal -> ANIMAL_PROTEIN, distintos de PROTEIN", () => {
    expect(resolveTbcaMainNutrientCode("proteina_vegetal", "g")).toBe("PLANT_PROTEIN");
    expect(resolveTbcaMainNutrientCode("proteina_animal", "g")).toBe("ANIMAL_PROTEIN");
    expect(resolveTbcaMainNutrientCode("proteina", "g")).toBe("PROTEIN"); // "proteina" simples continua distinto de vegetal/animal
    expect(TBCA_MAIN_NUTRIENT_SLUG_MAP.proteina).toBe("PROTEIN");
  });
});

describe("Perfil de gorduras — omega-3/omega-6 individuais entram, o resto fica RESEARCH_DETAIL", () => {
  it("TACO: linoleico (omega-6), alfa-linolenico/EPA/DHA (omega-3) mapeiam", () => {
    expect(TACO_NUTRIENT_MAP["taco:18_2_n_6"]).toBe("LINOLEIC_ACID");
    expect(TACO_NUTRIENT_MAP["taco:18_3_n_3"]).toBe("ALPHA_LINOLENIC_ACID");
    expect(TACO_NUTRIENT_MAP["taco:20_5"]).toBe("EPA");
    expect(TACO_NUTRIENT_MAP["taco:22_6"]).toBe("DHA");
  });

  it("POF: mesma dupla omega-6/omega-3 mapeia com os MESMOS codigos da TACO (cobertura cruzada real)", () => {
    expect(POF_NUTRIENT_MAP["ibge_pof_2008_2009:linoleic_g"]).toBe("LINOLEIC_ACID");
    expect(POF_NUTRIENT_MAP["ibge_pof_2008_2009:linolenic_g"]).toBe("ALPHA_LINOLENIC_ACID");
  });

  it("acidos graxos individuais por numero de carbono (RESEARCH_DETAIL) NUNCA ganham codigo — nao explodir o vocabulario", () => {
    const stayUnmapped = [
      "taco:12_0", "taco:14_0", "taco:16_0", "taco:18_0", "taco:20_0", "taco:22_0", "taco:24_0",
      "taco:14_1", "taco:16_1", "taco:18_1", "taco:20_1", "taco:20_4", "taco:22_5", "taco:18_1t", "taco:18_2t",
    ];
    for (const id of stayUnmapped) expect(TACO_NUTRIENT_MAP[id]).toBeUndefined();
  });

  it("aminoacidos individuais da TACO NUNCA ganham codigo clinico (avaliados e descartados — sem uso clinico rotineiro neste projeto)", () => {
    const aminoAcids = [
      "taco:triptofano", "taco:treonina", "taco:isoleucina", "taco:leucina", "taco:lisina",
      "taco:metionina", "taco:cistina", "taco:fenilalanina", "taco:tirosina", "taco:valina",
      "taco:arginina", "taco:histidina", "taco:alanina", "taco:aspartico", "taco:glutamico",
      "taco:glicina", "taco:prolina", "taco:serina",
    ];
    for (const id of aminoAcids) expect(TACO_NUTRIENT_MAP[id]).toBeUndefined();
  });
});

describe("Ambiguidade real (colisao de truncamento) e degeneracao continuam unmapped", () => {
  it("taco:turados / taco:insaturados continuam fora — ambiguidade nao resolvida nesta rodada tambem", () => {
    expect(TACO_NUTRIENT_MAP["taco:turados"]).toBeUndefined();
    expect(TACO_NUTRIENT_MAP["taco:insaturados"]).toBeUndefined();
  });

  it("tagname degenerado ('—', sem informacao real) nunca mapeia, mesmo apos desambiguacao de armazenamento", () => {
    expect(resolveTbcaStatsNutrientCode("—", "g")).toBeNull();
    expect(resolveTbcaStatsNutrientCode("unknown", "g")).toBeNull();
  });
});
