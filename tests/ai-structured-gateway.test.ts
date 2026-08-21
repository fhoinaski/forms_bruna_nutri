import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const testSchema = z.object({ value: z.string() });

function mockAi(generateTextImpl: ReturnType<typeof vi.fn>) {
  vi.doMock("ai", () => ({ generateText: generateTextImpl }));
  vi.doMock("@/lib/repositories/ai-settings", () => ({
    getAISettings: vi.fn().mockResolvedValue({
      id: "default", provider: "openai", model: "gpt-4o", api_key: "sk-test",
      protocol_system_prompt: null, chat_system_prompt: null,
      patient_intake_mode: "smart", updated_at: "x",
    }),
  }));
  vi.doMock("@/lib/ai/model-factory", () => ({ createConfiguredModel: vi.fn().mockReturnValue({}) }));
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
}

const okText = (value: string) => ({ text: `{"value":"${value}"}`, usage: { inputTokens: 1, outputTokens: 1 } });

async function loadGateway() {
  return import("@/lib/ai/gateway/ai-gateway");
}

describe("generateStructured — gateway resiliente (provider-agnostic)", () => {
  it("sucesso na primeira tentativa", async () => {
    mockAi(vi.fn().mockResolvedValue(okText("a")));
    const { generateStructured } = await loadGateway();
    const data = await generateStructured({ agent: "t", system: "s", prompt: "p", schema: testSchema });
    expect(data.value).toBe("a");
  });

  it("recupera JSON em fence markdown (DeepSeek-like)", async () => {
    mockAi(vi.fn().mockResolvedValue({ text: '```json\n{"value":"a"}\n```', usage: {} }));
    const { generateStructured } = await loadGateway();
    const data = await generateStructured({ agent: "t", system: "s", prompt: "p", schema: testSchema });
    expect(data.value).toBe("a");
  });

  it("recupera JSON com prefixo/sufixo (Anthropic-like)", async () => {
    mockAi(vi.fn().mockResolvedValue({ text: 'Claro! Segue: {"value":"a"} Espero ter ajudado.', usage: {} }));
    const { generateStructured } = await loadGateway();
    const data = await generateStructured({ agent: "t", system: "s", prompt: "p", schema: testSchema });
    expect(data.value).toBe("a");
  });

  it("repara na segunda tentativa (repair)", async () => {
    const generateText = vi.fn()
      .mockResolvedValueOnce({ text: '{"wrong":"x"}', usage: {} })
      .mockResolvedValueOnce(okText("b"));
    mockAi(generateText);
    const { generateStructuredResult } = await loadGateway();
    const result = await generateStructuredResult({ agent: "t", system: "s", prompt: "p", schema: testSchema });
    expect(result.data.value).toBe("b");
    expect(result.repaired).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("detecta JSON truncado e tenta de novo (Mistral-like)", async () => {
    const generateText = vi.fn()
      .mockResolvedValueOnce({ text: '{"value":"a"', usage: {} })
      .mockResolvedValueOnce(okText("b"));
    mockAi(generateText);
    const { generateStructuredResult } = await loadGateway();
    const result = await generateStructuredResult({ agent: "t", system: "s", prompt: "p", schema: testSchema });
    expect(result.data.value).toBe("b");
    expect(result.repaired).toBe(true);
  });

  it("lança AiValidationError (truncated) após esgotar as tentativas", async () => {
    mockAi(vi.fn().mockResolvedValue({ text: '{"value":"a"', usage: {} }));
    const { generateStructured } = await loadGateway();
    await expect(generateStructured({ agent: "t", system: "s", prompt: "p", schema: testSchema }))
      .rejects.toMatchObject({ name: "AiValidationError", truncated: true, failureCategory: "structured_truncated" });
  });

  it("lança AiProviderError em falha de provider (não AiValidationError)", async () => {
    mockAi(vi.fn().mockRejectedValue(new Error("HTTP 500")));
    const { generateStructured } = await loadGateway();
    await expect(generateStructured({ agent: "t", system: "s", prompt: "p", schema: testSchema }))
      .rejects.toMatchObject({ name: "AiProviderError" });
  });

  it("aplica normalize antes do safeParse", async () => {
    mockAi(vi.fn().mockResolvedValue({ text: '{"value":"x"}', usage: {} }));
    const { generateStructured } = await loadGateway();
    const data = await generateStructured({
      agent: "t", system: "s", prompt: "p", schema: testSchema,
      normalize: () => ({ value: "normalizado" }),
    });
    expect(data.value).toBe("normalizado");
  });
});

describe("classifyAiError", () => {
  it("classifica config/auth/validation/provider/timeout", async () => {
    const { classifyAiError, AiValidationError, AiProviderError } = await import("@/lib/ai/core/ai-errors");
    expect(classifyAiError(new AiValidationError("x"))).toBe("structured_invalid");
    expect(classifyAiError(new AiValidationError("x", [], "structured_truncated", true))).toBe("structured_truncated");
    expect(classifyAiError(new AiProviderError("boom", { statusCode: 429 }))).toBe("rate_limit");
    expect(classifyAiError(new AiProviderError("boom", { statusCode: 401 }))).toBe("auth");
    expect(classifyAiError(new AiProviderError("boom", { name: "TimeoutError" }))).toBe("timeout");
  });
});

describe("classifyStructuredFailureReason — diagnóstico granular (nunca exposto ao usuário)", () => {
  it("resposta vazia/whitespace → EMPTY_RESPONSE", async () => {
    const { classifyStructuredFailureReason } = await import("@/lib/ai/core/ai-errors");
    expect(classifyStructuredFailureReason({ rawText: "", parseSucceeded: false, truncated: false })).toBe("EMPTY_RESPONSE");
    expect(classifyStructuredFailureReason({ rawText: "   \n  ", parseSucceeded: false, truncated: false })).toBe("EMPTY_RESPONSE");
  });

  it("JSON truncado → TRUNCATED_RESPONSE (mesmo com texto não vazio)", async () => {
    const { classifyStructuredFailureReason } = await import("@/lib/ai/core/ai-errors");
    expect(classifyStructuredFailureReason({ rawText: '{"a":1', parseSucceeded: false, truncated: true })).toBe("TRUNCATED_RESPONSE");
  });

  it("texto não vazio, não truncado, não parseia → INVALID_JSON", async () => {
    const { classifyStructuredFailureReason } = await import("@/lib/ai/core/ai-errors");
    expect(classifyStructuredFailureReason({ rawText: "isso não é json", parseSucceeded: false, truncated: false })).toBe("INVALID_JSON");
  });

  it("unrecognized_keys → EXTRA_FIELDS", async () => {
    const { classifyStructuredFailureReason } = await import("@/lib/ai/core/ai-errors");
    const reason = classifyStructuredFailureReason({
      rawText: "{}", parseSucceeded: true, truncated: false,
      zodIssues: [{ path: [], code: "unrecognized_keys", message: "Unrecognized key" }],
    });
    expect(reason).toBe("EXTRA_FIELDS");
  });

  it("invalid_type com 'received undefined' → MISSING_REQUIRED_FIELDS", async () => {
    const { classifyStructuredFailureReason } = await import("@/lib/ai/core/ai-errors");
    const reason = classifyStructuredFailureReason({
      rawText: "{}", parseSucceeded: true, truncated: false,
      zodIssues: [{ path: ["meals", 0, "mealKey"], code: "invalid_type", message: "expected string, received undefined" }],
    });
    expect(reason).toBe("MISSING_REQUIRED_FIELDS");
  });

  it("invalid_value (enum) → INVALID_ENUM", async () => {
    const { classifyStructuredFailureReason } = await import("@/lib/ai/core/ai-errors");
    const reason = classifyStructuredFailureReason({
      rawText: "{}", parseSucceeded: true, truncated: false,
      zodIssues: [{ path: ["meals", 0, "mealKey"], code: "invalid_value", message: "Invalid option" }],
    });
    expect(reason).toBe("INVALID_ENUM");
  });

  it("invalid_type esperando number → INVALID_NUMBER_TYPE", async () => {
    const { classifyStructuredFailureReason } = await import("@/lib/ai/core/ai-errors");
    const reason = classifyStructuredFailureReason({
      rawText: "{}", parseSucceeded: true, truncated: false,
      zodIssues: [{ path: ["meals", 0, "items", 0, "quantity"], code: "invalid_type", expected: "number", message: "expected number, received string" }],
    });
    expect(reason).toBe("INVALID_NUMBER_TYPE");
  });

  it("sem issues → UNKNOWN", async () => {
    const { classifyStructuredFailureReason } = await import("@/lib/ai/core/ai-errors");
    expect(classifyStructuredFailureReason({ rawText: "{}", parseSucceeded: true, truncated: false, zodIssues: [] })).toBe("UNKNOWN");
  });
});

describe("buildValidationFeedbackPrompt", () => {
  it("lista path+code de forma compacta, sem reenviar contexto", async () => {
    const { buildValidationFeedbackPrompt } = await import("@/lib/ai/core/ai-errors");
    const prompt = buildValidationFeedbackPrompt([
      { path: ["meals", 0, "mealKey"], code: "invalid_value" },
      { path: ["meals", 1, "items", 0, "quantity"], code: "invalid_type" },
    ]);
    expect(prompt).toContain("meals.0.mealKey: invalid_value");
    expect(prompt).toContain("meals.1.items.0.quantity: invalid_type");
    expect(prompt.length).toBeLessThan(600);
  });

  it("corta em 8 issues (nunca infla o prompt de novo)", async () => {
    const { buildValidationFeedbackPrompt } = await import("@/lib/ai/core/ai-errors");
    const issues = Array.from({ length: 20 }, (_, i) => ({ path: ["meals", i], code: "invalid_type" }));
    const prompt = buildValidationFeedbackPrompt(issues);
    expect((prompt.match(/invalid_type/g) ?? []).length).toBe(8);
  });
});

describe("generateStructuredResult — recuperação inteligente (retry diferenciado + rawData p/ recuperação parcial)", () => {
  it("segunda tentativa recebe feedback de validação específico (não o aviso genérico) quando JSON é válido mas o schema não bate", async () => {
    const generateText = vi.fn()
      .mockResolvedValueOnce({ text: '{"value":123}', usage: {} }) // number em vez de string → SCHEMA_MISMATCH
      .mockResolvedValueOnce(okText("b"));
    mockAi(generateText);
    const { generateStructuredResult } = await loadGateway();
    const result = await generateStructuredResult({ agent: "t", system: "s", prompt: "p", schema: testSchema });
    expect(result.data.value).toBe("b");
    const secondCallSystem = generateText.mock.calls[1][0].system as string;
    expect(secondCallSystem).toContain("value: invalid_type");
    expect(secondCallSystem).not.toContain("não correspondeu ao formato solicitado");
  });

  it("truncamento aumenta o orçamento de tokens da próxima tentativa (com teto)", async () => {
    const generateText = vi.fn()
      .mockResolvedValueOnce({ text: '{"value":"a"', usage: {} }) // truncado
      .mockResolvedValueOnce(okText("b"));
    mockAi(generateText);
    const { generateStructuredResult } = await loadGateway();
    await generateStructuredResult({ agent: "t", system: "s", prompt: "p", schema: testSchema, maxOutputTokens: 1000 });
    const secondCallTokens = generateText.mock.calls[1][0].maxOutputTokens as number;
    expect(secondCallTokens).toBeGreaterThan(1000);
    expect(secondCallTokens).toBeLessThanOrEqual(8000);
  });

  it("AiValidationError final carrega rawData (último payload JSON válido) e reason granular", async () => {
    const numericSchema = z.object({ quantity: z.number() });
    mockAi(vi.fn().mockResolvedValue({ text: '{"quantity":"100g"}', usage: {} }));
    const { generateStructuredResult } = await loadGateway();
    await expect(generateStructuredResult({ agent: "t", system: "s", prompt: "p", schema: numericSchema, maxAttempts: 2 }))
      .rejects.toMatchObject({ name: "AiValidationError", reason: "INVALID_NUMBER_TYPE", rawData: { quantity: "100g" } });
  });

  it("resposta vazia repetida vira AiValidationError com reason EMPTY_RESPONSE", async () => {
    mockAi(vi.fn().mockResolvedValue({ text: "", usage: {} }));
    const { generateStructuredResult } = await loadGateway();
    await expect(generateStructuredResult({ agent: "t", system: "s", prompt: "p", schema: testSchema, maxAttempts: 2 }))
      .rejects.toMatchObject({ name: "AiValidationError", reason: "EMPTY_RESPONSE" });
  });
});
