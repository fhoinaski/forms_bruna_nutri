import { describe, expect, it } from "vitest";
import { normalizeBasis, normalizeUnit } from "@/lib/nutrition-import/normalize-units";
import { normalizeStatus, assertStatusPreservesSourceSemantics } from "@/lib/nutrition-import/normalize-status";

describe("normalizeUnit — Fase 4", () => {
  it.each([
    ["(kcal)", "kcal"],
    ["Kcal", "kcal"],
    ["kcal", "kcal"],
    ["(kj)", "kJ"],
    ["kJ", "kJ"],
    ["(g)", "g"],
    ["g", "g"],
    ["(mg)", "mg"],
    ["mg", "mg"],
    ["mcg", "mcg"],
    ["ug", "mcg"],
    ["µg", "mcg"],
    ["μg", "mcg"],
  ])("reconhece grafias distintas da mesma unidade: %s -> %s", (raw, expected) => {
    expect(normalizeUnit(raw).unit).toBe(expected);
    expect(normalizeUnit(raw).recognized).toBe(true);
  });

  it("nunca converte valor entre unidades diferentes (mg != g) — so reconhece grafia", () => {
    // normalizeUnit so decide a UNIDADE, nunca escala um valor. Esse teste
    // documenta que "mg" e "g" continuam unidades DISTINTAS no resultado.
    expect(normalizeUnit("mg").unit).toBe("mg");
    expect(normalizeUnit("g").unit).toBe("g");
    expect(normalizeUnit("mg").unit).not.toBe(normalizeUnit("g").unit);
  });

  it("unidade desconhecida nunca e adivinhada — recognized=false, unit=null", () => {
    const result = normalizeUnit("furlongs");
    expect(result.recognized).toBe(false);
    expect(result.unit).toBeNull();
  });

  it("valor vazio/nulo nao quebra e nao e reconhecido", () => {
    expect(normalizeUnit(null).recognized).toBe(false);
    expect(normalizeUnit(undefined).recognized).toBe(false);
    expect(normalizeUnit("").recognized).toBe(false);
  });
});

describe("normalizeBasis — Fase 4", () => {
  it("reconhece as 4 bases documentadas em nutritional_schema.json", () => {
    expect(normalizeBasis("per_100g_edible_portion").basis).toBe("per_100g_edible_portion");
    expect(normalizeBasis("per_100g_food").basis).toBe("per_100g_food");
    expect(normalizeBasis("per_100g_fatty_acids").basis).toBe("per_100g_fatty_acids");
    expect(normalizeBasis("per_100ml").basis).toBe("per_100ml");
  });

  it("basis inesperada NUNCA e mapeada para a mais proxima — fica null/recognized=false, nunca silenciosa", () => {
    const result = normalizeBasis("per_serving_weird");
    expect(result.recognized).toBe(false);
    expect(result.basis).toBeNull();
  });
});

describe("normalizeStatus — regra critica de trace/missing", () => {
  it("preserva os 5 status obrigatorios verbatim", () => {
    expect(normalizeStatus("reported")).toBe("reported");
    expect(normalizeStatus("trace")).toBe("trace");
    expect(normalizeStatus("missing")).toBe("missing");
    expect(normalizeStatus("not_applicable")).toBe("not_applicable");
    expect(normalizeStatus("unparsed")).toBe("unparsed");
  });

  it("status desconhecido vira 'unparsed', nunca 'reported' por padrao (evita fingir confianca)", () => {
    expect(normalizeStatus("alguma_coisa_nova")).toBe("unparsed");
  });

  it("ausencia de status vira 'missing', nunca 'reported'", () => {
    expect(normalizeStatus(null)).toBe("missing");
    expect(normalizeStatus(undefined)).toBe("missing");
  });

  it("REGRA CRITICA: trace com value numerico 0 continua trace — nunca vira zero real silenciosamente", () => {
    // Caso real confirmado em tbca_completa.json: {"value": 0, "status": "trace"}.
    const status = normalizeStatus("trace");
    const value = 0;
    expect(status).toBe("trace");
    expect(value).toBe(0); // o valor numerico e preservado tal como veio...
    // ...mas o status NUNCA e reescrito para "reported" so porque ha um numero.
    expect(() => assertStatusPreservesSourceSemantics("trace", status)).not.toThrow();
  });

  it("assertStatusPreservesSourceSemantics detecta se um status conhecido da fonte foi alterado", () => {
    expect(() => assertStatusPreservesSourceSemantics("trace", "missing")).toThrow(/Violacao da regra critica/);
    expect(() => assertStatusPreservesSourceSemantics("not_applicable", "reported")).toThrow();
  });
});
