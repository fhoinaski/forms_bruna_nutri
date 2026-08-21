import { describe, expect, it } from "vitest";
import { calculateBmiValue, classifyAdultBmi } from "@/lib/clinical/anthropometry";

/**
 * Casos explicitamente pedidos na auditoria da calculadora rápida de IMC
 * (item 1 do pedido). Reutiliza calculateBmiValue/classifyAdultBmi — a
 * MESMA função já usada no prontuário/evolução clínica, nunca uma fórmula
 * paralela.
 */
describe("Calculadora rápida de IMC — casos obrigatórios", () => {
  it("68,5 kg / 1,65 m (altura em metros) calcula corretamente", () => {
    const bmi = calculateBmiValue("68,5", "1,65");
    expect(bmi).toBe(25.2);
    expect(classifyAdultBmi(bmi)).toBe("Sobrepeso");
  });

  it("68,5 kg / 165 cm (altura em centímetros) produz o mesmo resultado", () => {
    const bmiCm = calculateBmiValue("68,5", "165");
    const bmiM = calculateBmiValue("68,5", "1,65");
    expect(bmiCm).toBe(bmiM);
  });

  it("aceita peso decimal", () => {
    expect(calculateBmiValue(72.3, 170)).toBe(25);
  });

  it("altura inválida (texto sem número) retorna null, nunca um número inventado", () => {
    expect(calculateBmiValue("70", "abc")).toBeNull();
  });

  it("peso zero retorna null (não divide por/com zero silenciosamente)", () => {
    expect(calculateBmiValue(0, 170)).toBeNull();
  });

  it("altura zero retorna null", () => {
    expect(calculateBmiValue(70, 0)).toBeNull();
  });

  it("peso negativo retorna null", () => {
    expect(calculateBmiValue(-70, 170)).toBeNull();
  });

  it("campo vazio retorna null", () => {
    expect(calculateBmiValue("", "170")).toBeNull();
    expect(calculateBmiValue("70", "")).toBeNull();
    expect(calculateBmiValue(null, null)).toBeNull();
    expect(calculateBmiValue(undefined, undefined)).toBeNull();
  });

  it("classificação cobre as 6 faixas da OMS sem sobreposição", () => {
    expect(classifyAdultBmi(18.4)).toBe("Baixo peso");
    expect(classifyAdultBmi(18.5)).toBe("Eutrofia");
    expect(classifyAdultBmi(24.9)).toBe("Eutrofia");
    expect(classifyAdultBmi(25)).toBe("Sobrepeso");
    expect(classifyAdultBmi(29.9)).toBe("Sobrepeso");
    expect(classifyAdultBmi(30)).toBe("Obesidade grau I");
    expect(classifyAdultBmi(34.9)).toBe("Obesidade grau I");
    expect(classifyAdultBmi(35)).toBe("Obesidade grau II");
    expect(classifyAdultBmi(39.9)).toBe("Obesidade grau II");
    expect(classifyAdultBmi(40)).toBe("Obesidade grau III");
  });

  it("classificação de IMC nulo retorna null (não classifica dado ausente)", () => {
    expect(classifyAdultBmi(null)).toBeNull();
  });
});
