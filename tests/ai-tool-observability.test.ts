import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * FASE 2A (item 9 do pedido) — observabilidade de chamadas de tool: registra
 * metadata SEGURA (tool, dominio, sucesso, duracao, ids de entidade
 * reconhecidos) e NUNCA o conteudo bruto de input/output.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("withToolCallObservability", () => {
  it("loga tool/domain/success/durationMs em caso de sucesso, nunca o output bruto", async () => {
    const debugSpy = vi.fn();
    vi.doMock("@/lib/observability/logger", () => ({ logger: { debug: debugSpy, warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
    const { withToolCallObservability } = await import("../lib/ai/tools/tool-call-observability");

    const execute = withToolCallObservability("getPatientRequestDetails", "request", async (input: { requestId: string }) => ({
      found: true,
      request: { patientText: "texto sensivel da paciente que nunca deve ir para o log" },
    }));

    await execute({ requestId: "req-1" });

    expect(debugSpy).toHaveBeenCalledTimes(1);
    const [message, context] = debugSpy.mock.calls[0];
    expect(message).toBe("ai_tool_call");
    expect(context).toMatchObject({ tool: "getPatientRequestDetails", domain: "request", success: true });
    expect(typeof context.durationMs).toBe("number");
    expect(context.entityIds).toEqual({ requestId: "req-1" });
    expect(JSON.stringify(context)).not.toContain("texto sensivel da paciente");
  });

  it("loga warn com success:false em caso de erro, e sempre re-lanca o erro (nunca engole)", async () => {
    const warnSpy = vi.fn();
    vi.doMock("@/lib/observability/logger", () => ({ logger: { debug: vi.fn(), warn: warnSpy, info: vi.fn(), error: vi.fn() } }));
    const { withToolCallObservability } = await import("../lib/ai/tools/tool-call-observability");

    const execute = withToolCallObservability("getPaymentDetails", "finance", async () => {
      throw new Error("falha ao consultar pagamento");
    });

    await expect(execute({ paymentId: "pay-1" })).rejects.toThrow("falha ao consultar pagamento");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [, context] = warnSpy.mock.calls[0];
    expect(context).toMatchObject({ tool: "getPaymentDetails", domain: "finance", success: false });
  });

  it("nunca extrai como entityId uma chave que nao esteja na allowlist (ex.: query/patientText livres)", async () => {
    const debugSpy = vi.fn();
    vi.doMock("@/lib/observability/logger", () => ({ logger: { debug: debugSpy, warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
    const { withToolCallObservability } = await import("../lib/ai/tools/tool-call-observability");

    const execute = withToolCallObservability("searchFoods", "food", async () => ({ items: [] }));
    await execute({ query: "arroz integral com informacao sensivel do paciente" });

    const [, context] = debugSpy.mock.calls[0];
    expect(context.entityIds).toBeUndefined();
    expect(JSON.stringify(context)).not.toContain("informacao sensivel");
  });
});
