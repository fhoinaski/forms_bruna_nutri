import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * Provider determinístico de E2E na fronteira do AI gateway (V4 do
 * fechamento de gaps, seção 26) — testa isolamento por (agent, key),
 * one-shot, rejeição de schema inválido, e que produção nunca é afetada.
 *
 * Usa vi.mock (hoisted, estático) em vez de vi.doMock por teste — a
 * memória do projeto documenta que múltiplos vi.doMock() do MESMO
 * specifier no mesmo arquivo só respeitam o primeiro; aqui as 4
 * dependências externas são mockadas uma única vez no topo do arquivo e
 * reconfiguradas por teste via mockResolvedValueOnce/mockRejectedValueOnce.
 */

const generateTextMock = vi.fn();
vi.mock("ai", () => ({ generateText: (...args: unknown[]) => generateTextMock(...args) }));

const getAISettingsMock = vi.fn();
vi.mock("@/lib/repositories/ai-settings", () => ({ getAISettings: (...args: unknown[]) => getAISettingsMock(...args) }));

vi.mock("@/lib/ai/model-factory", () => ({ createConfiguredModel: vi.fn().mockReturnValue({}) }));
vi.mock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

import { setE2EStructuredFixture, takeE2EStructuredFixture, isE2EGatewayTestModeEnabled } from "@/lib/ai/gateway/e2e-fixtures";
import { generateStructuredResult } from "@/lib/ai/gateway/ai-gateway";

const ORIGINAL_E2E_TEST_MODE = process.env.E2E_TEST_MODE;

beforeEach(() => {
  generateTextMock.mockReset();
  getAISettingsMock.mockReset().mockResolvedValue({ api_key: "k", provider: "openai", model: "gpt-4" });
});

afterEach(() => {
  if (ORIGINAL_E2E_TEST_MODE === undefined) delete process.env.E2E_TEST_MODE;
  else process.env.E2E_TEST_MODE = ORIGINAL_E2E_TEST_MODE;
});

describe("lib/ai/gateway/e2e-fixtures.ts — registro e consumo", () => {
  it("fixture registrada é consumida uma única vez (one-shot)", () => {
    setE2EStructuredFixture("agent-a", "client-1", { foo: "bar" });
    expect(takeE2EStructuredFixture("agent-a", "client-1")).toEqual({ foo: "bar" });
    expect(takeE2EStructuredFixture("agent-a", "client-1")).toBeUndefined();
  });

  it("agent errado não consome a fixture de outro agent", () => {
    setE2EStructuredFixture("agent-a", "client-1", { foo: "bar" });
    expect(takeE2EStructuredFixture("agent-b", "client-1")).toBeUndefined();
    expect(takeE2EStructuredFixture("agent-a", "client-1")).toEqual({ foo: "bar" });
  });

  it("key errada (cliente errado) não consome a fixture de outro cliente", () => {
    setE2EStructuredFixture("agent-a", "client-1", { foo: "bar" });
    expect(takeE2EStructuredFixture("agent-a", "client-2")).toBeUndefined();
    expect(takeE2EStructuredFixture("agent-a", "client-1")).toEqual({ foo: "bar" });
  });

  it("dois clientes registrando fixtures pro mesmo agent não colidem entre si", () => {
    setE2EStructuredFixture("agent-a", "client-1", { who: "one" });
    setE2EStructuredFixture("agent-a", "client-2", { who: "two" });
    expect(takeE2EStructuredFixture("agent-a", "client-2")).toEqual({ who: "two" });
    expect(takeE2EStructuredFixture("agent-a", "client-1")).toEqual({ who: "one" });
  });

  it("key undefined nunca consome nada (evita colisão com chamadas sem clientId)", () => {
    setE2EStructuredFixture("agent-a", "client-1", { foo: "bar" });
    expect(takeE2EStructuredFixture("agent-a", undefined)).toBeUndefined();
    expect(takeE2EStructuredFixture("agent-a", "client-1")).toEqual({ foo: "bar" });
  });
});

describe("isE2EGatewayTestModeEnabled — nunca ativo em produção por acidente", () => {
  it("false quando E2E_TEST_MODE não está setado", () => {
    delete process.env.E2E_TEST_MODE;
    expect(isE2EGatewayTestModeEnabled()).toBe(false);
  });

  it('false com qualquer valor diferente de "1" (ex.: "true")', () => {
    process.env.E2E_TEST_MODE = "true";
    expect(isE2EGatewayTestModeEnabled()).toBe(false);
  });

  it('true só com exatamente "1"', () => {
    process.env.E2E_TEST_MODE = "1";
    expect(isE2EGatewayTestModeEnabled()).toBe(true);
  });
});

describe("generateStructuredResult — integração com a fixture na fronteira do gateway", () => {
  const schema = z.object({ candidates: z.array(z.string()) }).strict();

  it("com E2E_TEST_MODE=1 e fixture registrada: devolve a fixture validada, NUNCA chama o provider real", async () => {
    process.env.E2E_TEST_MODE = "1";
    generateTextMock.mockRejectedValue(new Error("nunca deveria ser chamado"));
    setE2EStructuredFixture("meal-plan-substitution-suggestion", "client-fixture-1", { candidates: ["batata"] });

    const result = await generateStructuredResult({
      agent: "meal-plan-substitution-suggestion",
      e2eFixtureKey: "client-fixture-1",
      system: "sys",
      prompt: "prompt",
      schema,
    });
    expect(result.data).toEqual({ candidates: ["batata"] });
    expect(result.provider).toBe("e2e-deterministic");
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("fixture que não bate com o schema real do agente é rejeitada (nunca aceita silenciosamente)", async () => {
    process.env.E2E_TEST_MODE = "1";
    generateTextMock.mockRejectedValue(new Error("nunca deveria ser chamado"));
    setE2EStructuredFixture("meal-plan-substitution-suggestion", "client-fixture-2", { candidates: "não é um array" });

    await expect(generateStructuredResult({
      agent: "meal-plan-substitution-suggestion",
      e2eFixtureKey: "client-fixture-2",
      system: "sys",
      prompt: "prompt",
      schema,
    })).rejects.toThrow(/schema real/i);
  });

  it("sem e2eFixtureKey: mesmo com E2E_TEST_MODE=1, cai no caminho real (chamada sem clientId nunca é afetada)", async () => {
    process.env.E2E_TEST_MODE = "1";
    generateTextMock.mockResolvedValue({ text: '{"candidates":["real"]}', usage: {} });

    const result = await generateStructuredResult({
      agent: "meal-plan-substitution-suggestion",
      system: "sys",
      prompt: "prompt",
      schema,
    });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({ candidates: ["real"] });
  });

  it("E2E_TEST_MODE desligado (produção): fixture registrada é ignorada, chama o provider real mesmo assim", async () => {
    delete process.env.E2E_TEST_MODE;
    generateTextMock.mockResolvedValue({ text: '{"candidates":["real"]}', usage: {} });
    setE2EStructuredFixture("meal-plan-substitution-suggestion", "client-fixture-3", { candidates: ["fixture-vazando-em-producao"] });

    const result = await generateStructuredResult({
      agent: "meal-plan-substitution-suggestion",
      e2eFixtureKey: "client-fixture-3",
      system: "sys",
      prompt: "prompt",
      schema,
    });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({ candidates: ["real"] });
  });
});
