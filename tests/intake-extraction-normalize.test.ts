import { describe, expect, it } from "vitest";
import { normalizeTopicExtractionJson } from "@/lib/ai/agents/patient/intake/intake-schema";
import { isTruncatedJsonText } from "@/lib/ai/schemas/json-extract";

describe("normalizeTopicExtractionJson", () => {
  it("normaliza confidence (High/alta → high)", () => {
    const out = normalizeTopicExtractionJson({
      assistantText: "ok",
      extractedAnswers: [{ field: "motivacao", value: "quero emagrecer", confidence: "High" }],
    }) as { extractedAnswers: { confidence: string }[] };
    expect(out.extractedAnswers[0].confidence).toBe("high");
  });

  it("remove chaves extras (reasoning)", () => {
    const out = normalizeTopicExtractionJson({ assistantText: "", extractedAnswers: [], reasoning: "x" }) as Record<string, unknown>;
    expect(out).not.toHaveProperty("reasoning");
    expect(out).not.toHaveProperty("topic");
  });

  it("tolera assistantText vazio e clarification null", () => {
    const out = normalizeTopicExtractionJson({ extractedAnswers: [], clarification: null }) as Record<string, unknown>;
    expect(out.assistantText).toBe("");
    expect(out.clarification).toBeUndefined();
  });

  it("mantém campos válidos e descarta itens sem field (parcial)", () => {
    const out = normalizeTopicExtractionJson({
      assistantText: "",
      extractedAnswers: [
        { field: "objetivo", value: "emagrecer", confidence: "high" },
        { value: "sem campo", confidence: "high" },
      ],
    }) as { extractedAnswers: { field: string }[] };
    expect(out.extractedAnswers).toHaveLength(1);
    expect(out.extractedAnswers[0].field).toBe("objetivo");
  });

  it("não altera valores clínicos (só normalização técnica)", () => {
    const out = normalizeTopicExtractionJson({
      assistantText: "",
      extractedAnswers: [{ field: "diagnostico", value: "hipotireoidismo", confidence: "low" }],
    }) as { extractedAnswers: { value: string }[] };
    expect(out.extractedAnswers[0].value).toBe("hipotireoidismo");
  });
});

describe("isTruncatedJsonText", () => {
  it("detecta JSON não fechado", () => {
    expect(isTruncatedJsonText('{"value":"a"')).toBe(true);
  });
  it("não marca JSON completo", () => {
    expect(isTruncatedJsonText('{"value":"a"}')).toBe(false);
  });
});
