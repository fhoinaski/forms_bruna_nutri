import { describe, expect, it } from "vitest";
import { classifySubstitutionIntent, classifySubstitutionMessage } from "@/lib/ai/nutrition/substitution-command-router";

/**
 * Tabela da FASE 9 do pedido V3 (fechamento do blocker A) — classificação
 * 100% determinística (regex pequenas), nenhuma chamada de IA. Cobre
 * variações de acento/maiúsculas/plural conforme pedido, sem tentar ser uma
 * gramática exaustiva (nunca um "regex gigante").
 */
describe("classifySubstitutionMessage — READ", () => {
  it.each([
    "Quais alternativas para arroz?",
    "quais alternativas para arroz",
    "O que posso usar no lugar do arroz?",
    "Posso trocar o frango por peixe?",
    "posso substituir a banana?",
  ])("%s → READ", (text) => {
    expect(classifySubstitutionMessage(text).intent).toBe("READ");
  });
});

describe("classifySubstitutionMessage — WRITE", () => {
  it('"Adicione batata como substituição do arroz." → add_substitution', () => {
    const result = classifySubstitutionMessage("Adicione batata como substituição do arroz.");
    expect(result).toMatchObject({ intent: "WRITE", operation: "add_substitution", candidateFoodText: "batata", baseFoodText: "arroz" });
  });

  it('"Coloque mandioca como alternativa ao arroz." → add_substitution', () => {
    const result = classifySubstitutionMessage("Coloque mandioca como alternativa ao arroz.");
    expect(result).toMatchObject({ intent: "WRITE", operation: "add_substitution", candidateFoodText: "mandioca" });
  });

  it('"ADICIONE Batata Inglesa Cozida como opção de substituição do Arroz" (maiúsculas) → add_substitution', () => {
    const result = classifySubstitutionMessage("ADICIONE Batata Inglesa Cozida como opção de substituição do Arroz");
    expect(result.intent).toBe("WRITE");
    if (result.intent === "WRITE") {
      expect(result.operation).toBe("add_substitution");
      expect(result.candidateFoodText.toLowerCase()).toContain("batata");
    }
  });

  it('"Remova batata das substituições do arroz." → remove_substitution', () => {
    const result = classifySubstitutionMessage("Remova batata das substituições do arroz.");
    expect(result).toMatchObject({ intent: "WRITE", operation: "remove_substitution", candidateFoodText: "batata", baseFoodText: "arroz" });
  });

  it('"Aprove mandioca como substituição." → approve_substitution', () => {
    const result = classifySubstitutionMessage("Aprove mandioca como substituição.");
    expect(result.intent).toBe("WRITE");
    if (result.intent === "WRITE") {
      expect(result.operation).toBe("approve_substitution");
      expect(result.candidateFoodText).toBe("mandioca");
      expect(result.baseFoodText).toBeNull();
    }
  });
});

describe("classifySubstitutionMessage — AMBIGUOUS", () => {
  it('"Batata no lugar do arroz." → AMBIGUOUS (afirmação, sem verbo de ação)', () => {
    expect(classifySubstitutionMessage("Batata no lugar do arroz.").intent).toBe("AMBIGUOUS");
  });

  it('"Quero mudar o arroz." → AMBIGUOUS (intenção de mudança sem alvo claro)', () => {
    expect(classifySubstitutionMessage("Quero mudar o arroz.").intent).toBe("AMBIGUOUS");
  });

  it('vocabulário de substituição sem estrutura reconhecida → AMBIGUOUS', () => {
    expect(classifySubstitutionMessage("Preciso de umas opções de substituição aí.").intent).toBe("AMBIGUOUS");
  });
});

describe("classifySubstitutionMessage — NONE (fora do domínio, nunca intercepta)", () => {
  it('"Adicione arroz no almoço" → NONE (add_item comum, não é substituição)', () => {
    expect(classifySubstitutionMessage("Adicione arroz no almoço").intent).toBe("NONE");
  });

  it('"Marque uma consulta para amanhã" → NONE', () => {
    expect(classifySubstitutionMessage("Marque uma consulta para amanhã").intent).toBe("NONE");
  });

  it("string vazia → NONE", () => {
    expect(classifySubstitutionMessage("").intent).toBe("NONE");
  });
});

describe("classifySubstitutionIntent — continuação de pendência (FASE 6, sem estado persistido)", () => {
  it("mensagem de esclarecimento marcada pelo router: a resposta curta seguinte reaproveita o pedido original", () => {
    const messages = [
      { role: "user" as const, content: "Adicione batata como substituição do arroz." },
      { role: "assistant" as const, content: "Qual tipo de batata? <!-- [[substitution-router-clarify]] -->" },
      { role: "user" as const, content: "Batata inglesa cozida." },
    ];
    const result = classifySubstitutionIntent(messages);
    expect(result.intent).toBe("WRITE");
    if (result.intent === "WRITE") {
      expect(result.operation).toBe("add_substitution");
      expect(result.baseFoodText).toBe("arroz");
      expect(result.candidateFoodText).toBe("Batata inglesa cozida");
    }
  });

  it("resposta curta SEM o marcador do router (pergunta livre da IA) nunca reaproveita contexto — evita falso positivo", () => {
    const messages = [
      { role: "user" as const, content: "Adicione arroz no almoço" },
      { role: "assistant" as const, content: "Qual quantidade você quer usar?" },
      { role: "user" as const, content: "100g" },
    ];
    expect(classifySubstitutionIntent(messages).intent).toBe("NONE");
  });
});
