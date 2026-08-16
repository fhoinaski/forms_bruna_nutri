import { describe, expect, it } from "vitest";
import { containsClinicalSignal } from "@/lib/ai/policies/clinical-signal";

describe("containsClinicalSignal — guardrail determinístico do Nível 3", () => {
  it("detecta relato de sintoma/mal-estar", () => {
    expect(containsClinicalSignal("Estou passando mal depois dessa refeição")).toBe(true);
  });

  it("detecta alergia/reação alérgica", () => {
    expect(containsClinicalSignal("Acho que tive uma reação alérgica ao camarão")).toBe(true);
  });

  it("detecta intolerância não cadastrada", () => {
    expect(containsClinicalSignal("Descobri que tenho intolerância a lactose")).toBe(true);
  });

  it("detecta gestação", () => {
    expect(containsClinicalSignal("Estou grávida de 3 meses, posso continuar o plano?")).toBe(true);
  });

  it("detecta menção a medicamento", () => {
    expect(containsClinicalSignal("Comecei a tomar um remédio novo essa semana")).toBe(true);
  });

  it("detecta menção a suplemento", () => {
    expect(containsClinicalSignal("Posso tomar um suplemento de proteína junto?")).toBe(true);
  });

  it("é insensível a acento e caixa", () => {
    expect(containsClinicalSignal("ESTOU COM MUITA DÔR DE BARRIGA")).toBe(true);
  });

  it("não dispara para uma pergunta simples de substituição", () => {
    expect(containsClinicalSignal("Posso trocar o arroz por batata?")).toBe(false);
  });

  it("não dispara para perguntas informativas do portal", () => {
    expect(containsClinicalSignal("Onde vejo meu plano alimentar?")).toBe(false);
    expect(containsClinicalSignal("Qual minha próxima consulta?")).toBe(false);
  });

  it("string vazia nunca dispara", () => {
    expect(containsClinicalSignal("")).toBe(false);
  });
});
