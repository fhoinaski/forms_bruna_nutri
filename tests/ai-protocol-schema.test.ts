import { describe, expect, it } from "vitest";
import { protocolDraftOutputSchema } from "../lib/ai/schemas/protocol-draft.schema";
import { extractJsonFromText, tryParseJsonFromText } from "../lib/ai/schemas/json-extract";

const validDraft = {
  title: "Rascunho de conduta",
  caseSummary: "Resumo do caso.",
  mainGoals: ["Emagrecimento"],
  attentionPoints: ["Nenhum ponto critico identificado"],
  suggestedProtocol: {
    durationDays: 90,
    phases: [
      { title: "Fase 1", days: "1-21", objective: "Adaptar", actions: ["Revisar habitos"], notes: "" },
    ],
  },
  tasks: [],
  followUpQuestions: [],
  educationalMaterials: [],
  safetyNotes: ["Revisar com a paciente"],
  professionalReviewNotes: "",
};

describe("protocolDraftOutputSchema — antes disto o codigo fazia JSON.parse(...) as ProtocolDraftOutput sem validar nada", () => {
  it("accepts a well-formed draft", () => {
    expect(protocolDraftOutputSchema.safeParse(validDraft).success).toBe(true);
  });

  it("rejects a JSON object missing required fields", () => {
    const incomplete = { title: "Rascunho" };
    expect(protocolDraftOutputSchema.safeParse(incomplete).success).toBe(false);
  });

  it("rejects a draft with an empty phases array (schema requires at least one phase)", () => {
    const invalid = { ...validDraft, suggestedProtocol: { durationDays: 90, phases: [] } };
    expect(protocolDraftOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects wrong types (durationDays as string instead of number)", () => {
    const invalid = { ...validDraft, suggestedProtocol: { ...validDraft.suggestedProtocol, durationDays: "90" } };
    expect(protocolDraftOutputSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("json-extract helpers used before validating LLM output", () => {
  it("extracts JSON from a markdown code fence", () => {
    const text = "Aqui esta o rascunho:\n```json\n{\"a\":1}\n```\nEspero que ajude.";
    expect(extractJsonFromText(text).trim()).toBe('{"a":1}');
  });

  it("returns null (not a thrown SyntaxError) for malformed JSON", () => {
    const malformedText = "aqui esta seu rascunho: { title: sem aspas, isso nao eh json valido }";
    expect(tryParseJsonFromText(malformedText)).toBeNull();
  });

  it("a malformed LLM response never becomes a usable ProtocolDraftOutput", () => {
    const malformedText = "```json\n{ \"title\": \"ok\" \n```"; // json quebrado, sem fechar chaves
    const parsed = tryParseJsonFromText(malformedText);
    const result = protocolDraftOutputSchema.safeParse(parsed);
    expect(result.success).toBe(false);
  });
});
