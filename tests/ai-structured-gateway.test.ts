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
