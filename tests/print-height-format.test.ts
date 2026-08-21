import { describe, expect, it } from "vitest";
import { formatHeightDisplay } from "@/lib/clinical/anthropometry";

/**
 * Bug relatado: impressão mostrava "1.65 cm" (sem sentido) quando o campo
 * height_cm (texto livre) continha um valor em METROS. formatHeightDisplay
 * reusa o mesmo critério de calculateBmiValue (>10 = cm, senão metros) —
 * nunca assume cegamente que o campo é sempre centímetros.
 */
describe("formatHeightDisplay — nunca mostra '1.65 cm'", () => {
  it("valor em metros (1.65) formata como '1,65 m', nunca '1.65 cm'", () => {
    expect(formatHeightDisplay("1.65")).toBe("1,65 m");
    expect(formatHeightDisplay("1,65")).toBe("1,65 m");
    expect(formatHeightDisplay(1.65)).toBe("1,65 m");
  });

  it("valor em centímetros (165) formata como '165 cm'", () => {
    expect(formatHeightDisplay("165")).toBe("165 cm");
    expect(formatHeightDisplay(165)).toBe("165 cm");
  });

  it("nunca produz o formato quebrado 'X.XX cm' (ponto decimal + cm)", () => {
    const result = formatHeightDisplay("1.65");
    expect(result).not.toMatch(/\.\d+\s*cm/);
  });

  it("valor ausente/vazio/inválido retorna null (nunca inventa altura)", () => {
    expect(formatHeightDisplay(null)).toBeNull();
    expect(formatHeightDisplay(undefined)).toBeNull();
    expect(formatHeightDisplay("")).toBeNull();
    expect(formatHeightDisplay("abc")).toBeNull();
    expect(formatHeightDisplay("0")).toBeNull();
  });
});
