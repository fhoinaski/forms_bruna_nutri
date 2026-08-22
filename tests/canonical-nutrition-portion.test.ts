import { describe, expect, it } from "vitest";
import { parseLabelGrams, parseLabelMilliliters, resolvePortionWeight } from "@/lib/nutrition-import/portion-parsing";

describe("portion parsing — Fase 6 (medidas caseiras)", () => {
  it("extrai gramas do rotulo quando presentes entre parenteses", () => {
    expect(parseLabelGrams("Pedaço/Unidade/Fatia (M) (370 g)")).toBe(370);
    expect(parseLabelGrams("Colher sopa cheia (45 g)")).toBe(45);
  });

  it("extrai mL do rotulo quando presentes", () => {
    expect(parseLabelMilliliters("Copo americano duplo (200 mL)")).toBe(200);
  });

  it("rotulo sem peso/volume explicito nao inventa numero", () => {
    expect(parseLabelGrams("Pedaço/Unidade/Fatia (M)")).toBeNull();
  });

  it("measure em g vira gramWeight autoritativo com confianca alta", () => {
    const result = resolvePortionWeight("Colher sopa cheia (45 g)", { quantity: 45, unit: "g", raw: "45 g" });
    expect(result.gramWeight).toBe(45);
    expect(result.mlWeight).toBeNull();
    expect(result.weightSource).toBe("structured_quantity");
    expect(result.confidence).toBe("high");
    // parsedLabelGrams e calculado a parte, mesmo quando measure ja resolveu o peso — nunca omitido
    expect(result.parsedLabelGrams).toBe(45);
  });

  it("measure em mL NUNCA vira gramWeight — 'nao assumir mL = g' (Fase 18)", () => {
    const result = resolvePortionWeight("Copo americano duplo (200 mL)", { quantity: 200, unit: "ml", raw: "200 mL" });
    expect(result.mlWeight).toBe(200);
    expect(result.gramWeight).toBeNull();
    expect(result.weightSource).toBe("structured_quantity");
  });

  it("rotulo diz peso mas measure estruturado nao bate (ex.: measure.raw='M') — as duas informacoes ficam separadas, nunca uma sobrescreve a outra", () => {
    const result = resolvePortionWeight("Pedaço/Unidade/Fatia (M) (370 g)", { quantity: null, unit: null, raw: "M" });
    expect(result.parsedLabelGrams).toBe(370); // extraido do texto do rotulo...
    expect(result.gramWeight).toBeNull(); // ...mas NUNCA promovido a peso autoritativo automaticamente
    expect(result.weightSource).toBe("parsed_from_label");
    expect(result.confidence).toBe("low");
  });

  it("sem measure estruturado e sem rotulo com peso — tudo null, weightSource='unknown'", () => {
    const result = resolvePortionWeight("Porção pequena", null);
    expect(result.gramWeight).toBeNull();
    expect(result.mlWeight).toBeNull();
    expect(result.parsedLabelGrams).toBeNull();
    expect(result.weightSource).toBe("unknown");
  });
});
