import { describe, expect, it } from "vitest";
import {
  POF_NUTRIENT_MAP,
  TACO_NUTRIENT_MAP,
  TBCA_MAIN_NUTRIENT_SLUG_MAP,
  parseTbcaMainNutrientId,
  resolveTbcaMainNutrientCode,
  resolveTbcaStatsNutrientCode,
} from "@/lib/nutrition-import/nutrient-mapping";

describe("mapping TACO — nunca por name (Fase 3)", () => {
  it("mapeia por id, mesmo quando o name truncado nao corresponde ao nutriente real", () => {
    // "taco:idrato" tem name truncado ("idrato" em vez de "Carboidrato") na
    // propria fonte — o mapeamento tem que funcionar mesmo assim, porque usa
    // o id como chave, nunca o texto do name.
    expect(TACO_NUTRIENT_MAP["taco:idrato"]).toBe("CARBOHYDRATE");
    expect(TACO_NUTRIENT_MAP["taco:alimentar"]).toBe("FIBER");
  });

  it("renomear o campo `name` de um nutriente nao pode quebrar o mapeamento (a chave e sempre o id)", () => {
    const nutrient = { nutrient_id: "taco:proteina", name: "QUALQUER COISA, ate vazio" };
    expect(TACO_NUTRIENT_MAP[nutrient.nutrient_id]).toBe("PROTEIN");
    const renamed = { ...nutrient, name: "" };
    expect(TACO_NUTRIENT_MAP[renamed.nutrient_id]).toBe("PROTEIN");
  });

  it("taco:turados e taco:insaturados ficam FORA do mapa — colisao de truncamento ambigua, nao adivinhada", () => {
    expect(TACO_NUTRIENT_MAP["taco:turados"]).toBeUndefined();
    expect(TACO_NUTRIENT_MAP["taco:insaturados"]).toBeUndefined();
  });

  it("nutrientes sem NutrientCode equivalente (aminoacidos, retinol bruto) ficam fora do mapa, nunca inventados", () => {
    expect(TACO_NUTRIENT_MAP["taco:triptofano"]).toBeUndefined();
    expect(TACO_NUTRIENT_MAP["taco:retinol"]).toBeUndefined();
  });
});

describe("mapping POF — por id, preserva preparo/ambiguidade", () => {
  it("mapeia macros e micros conhecidos por id", () => {
    expect(POF_NUTRIENT_MAP["ibge_pof_2008_2009:protein_g"]).toBe("PROTEIN");
    expect(POF_NUTRIENT_MAP["ibge_pof_2008_2009:cobalamin_ug"]).toBe("VITAMIN_B12");
    expect(POF_NUTRIENT_MAP["ibge_pof_2008_2009:pyridoxine_mg"]).toBe("VITAMIN_B6");
  });

  it("niacin_ne_mg fica fora do mapa (equivalentes de niacina != niacin_mg direto — nao adivinha qual usar)", () => {
    expect(POF_NUTRIENT_MAP["ibge_pof_2008_2009:niacin_ne_mg"]).toBeUndefined();
    expect(POF_NUTRIENT_MAP["ibge_pof_2008_2009:niacin_mg"]).toBe("NIACIN");
  });
});

describe("mapping TBCA — colecao principal por slug+unidade, estatistica por tagname", () => {
  it("parseTbcaMainNutrientId extrai slug e unidade do nutrient_id real", () => {
    expect(parseTbcaMainNutrientId("tbca:vitamina_a_rae:mcg")).toEqual({ slug: "vitamina_a_rae", unit: "mcg" });
  });

  it("energia desambigua por unidade (kj vs kcal), nao aparece direto no mapa de slug", () => {
    expect(TBCA_MAIN_NUTRIENT_SLUG_MAP.energia).toBeUndefined();
    expect(resolveTbcaMainNutrientCode("energia", "kj")).toBe("ENERGY_KJ");
    expect(resolveTbcaMainNutrientCode("energia", "kcal")).toBe("ENERGY_KCAL");
  });

  it("unidade 'Kcal' capitalizada (achado real da auditoria em biodiversidade) ainda resolve — normalizacao e case-insensitive", () => {
    expect(resolveTbcaMainNutrientCode("energia", "Kcal")).toBe("ENERGY_KCAL");
  });

  it("carboidrato_total mapeia, mas carboidrato_disponivel fica fora (metrica distinta, nao adivinhada)", () => {
    expect(resolveTbcaMainNutrientCode("carboidrato_total", "g")).toBe("CARBOHYDRATE");
    expect(resolveTbcaMainNutrientCode("carboidrato_disponivel", "g")).toBeNull();
  });

  it("slug desconhecido nunca e mapeado por adivinhacao", () => {
    expect(resolveTbcaMainNutrientCode("nutriente_que_nao_existe", "g")).toBeNull();
  });

  it("tagname da colecao de estatistica mapeia independente do id da colecao principal", () => {
    expect(resolveTbcaStatsNutrientCode("PROCNT", "g")).toBe("PROTEIN");
    expect(resolveTbcaStatsNutrientCode("ENERC", "kj")).toBe("ENERGY_KJ");
    expect(resolveTbcaStatsNutrientCode("ENERC", "kcal")).toBe("ENERGY_KCAL");
  });
});
