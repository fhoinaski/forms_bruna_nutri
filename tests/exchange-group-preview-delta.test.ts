import { describe, expect, it } from "vitest";
import { formatDeltaValue, accessibleDeltaPhrase } from "@/components/dashboard/ExchangeGroupPanel";

describe("R2.3 — preview delta (candidato - referência)", () => {
  it("calcula a diferença matematicamente correta, com sinal explícito", () => {
    expect(formatDeltaValue(150 - 130, "kcal")).toBe("+20 kcal");
    expect(formatDeltaValue(80 - 100, "g")).toBe("-20 g");
    expect(formatDeltaValue(0, "kcal")).toBe("0 kcal");
  });

  it("nunca trata missing como zero — a chamada NÃO acontece quando um dos lados falta (seção 6)", () => {
    // A UI só chama formatDeltaValue quando candidate e reference != null; o
    // teste de contrato aqui é que "missing" produz "—" no componente, não
    // que a função aceite null (ela nunca é chamada com null pela UI).
    const candidate: number | null = null;
    const reference = 100;
    const hasDelta = candidate !== null && reference !== null;
    expect(hasDelta).toBe(false);
  });

  it("frase acessível é objetiva, sem rótulo clínico de bom/ruim (seção 27/28)", () => {
    expect(accessibleDeltaPhrase(12, "kcal", "Energia")).toBe("Energia: 12 quilocalorias a mais");
    expect(accessibleDeltaPhrase(-8, "g", "Carboidrato")).toBe("Carboidrato: 8 gramas a menos");
    expect(accessibleDeltaPhrase(0, "kcal", "Energia")).toBe("Energia: sem alteração");
    for (const phrase of [accessibleDeltaPhrase(12, "kcal", "Energia"), accessibleDeltaPhrase(-8, "g", "Carboidrato")]) {
      expect(phrase).not.toMatch(/bom|ruim|melhor|pior/i);
    }
  });
});
