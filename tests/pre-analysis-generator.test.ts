import { describe, expect, it } from "vitest";
import { PreAnalysisGeneratorSchema } from "@/lib/ai/agents/clinical/pre-analysis-generator";

describe("pre-analysis-generator — schema de saída", () => {
  it("rejeita saída sem summary", () => {
    const result = PreAnalysisGeneratorSchema.safeParse({
      attention_points: "x",
      main_goal: "y",
      restrictions: "z",
      professional_notes: "w",
    });
    expect(result.success).toBe(false);
  });

  it("aceita saída completa válida", () => {
    const result = PreAnalysisGeneratorSchema.safeParse({
      summary: "Resumo",
      attention_points: "Pontos",
      main_goal: "Objetivo",
      restrictions: "Restrições",
      professional_notes: "Perguntas sugeridas",
    });
    expect(result.success).toBe(true);
  });

  it("limita tamanhos dos campos (impede overflow silencioso)", () => {
    const long = "a".repeat(5001);
    const result = PreAnalysisGeneratorSchema.safeParse({
      summary: long,
      attention_points: "x",
      main_goal: "y",
      restrictions: "z",
      professional_notes: "w",
    });
    expect(result.success).toBe(false);
  });
});