import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Memoria do PATIENT_ASSISTANT (secao 24/44) — tabela/repositorio PROPRIO
 * (patient_conversation_summaries), isolado por client_id sozinho, nunca
 * compartilhado com ai_conversation_summaries (admin).
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("lib/ai/memory/patient-conversation-summary.ts", () => {
  it("le e grava usando so o client_id — nunca aceita nem precisa de admin_id", async () => {
    const getPatientConversationSummary = vi.fn().mockResolvedValue({ id: "s1", client_id: "client-A", summary: "linha antiga", updated_at: "x" });
    const upsertPatientConversationSummary = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/repositories/patient-conversation-summaries", () => ({ getPatientConversationSummary, upsertPatientConversationSummary }));

    const { getPatientConversationMemory, recordPatientConversationTurn } = await import("../lib/ai/memory/patient-conversation-summary");

    const memory = await getPatientConversationMemory("client-A");
    expect(getPatientConversationSummary).toHaveBeenCalledWith("client-A");
    expect(memory).toBe("linha antiga");

    await recordPatientConversationTurn("client-A", { topic: "qual meu café da manhã", proposalKind: undefined });
    expect(upsertPatientConversationSummary).toHaveBeenCalledWith("client-A", expect.stringContaining("qual meu café da manhã"));
  });

  it("memoria de um paciente nunca e lida ao consultar outro (isolamento por client_id)", async () => {
    const getPatientConversationSummary = vi.fn(async (clientId: string) =>
      clientId === "client-A" ? { id: "s1", client_id: "client-A", summary: "resumo de A", updated_at: "x" } : null
    );
    vi.doMock("@/lib/repositories/patient-conversation-summaries", () => ({ getPatientConversationSummary, upsertPatientConversationSummary: vi.fn() }));
    const { getPatientConversationMemory } = await import("../lib/ai/memory/patient-conversation-summary");

    expect(await getPatientConversationMemory("client-A")).toBe("resumo de A");
    expect(await getPatientConversationMemory("client-B")).toBeNull();
  });

  it("falha ao gravar memoria nunca derruba o turno (best-effort, so loga)", async () => {
    vi.doMock("@/lib/repositories/patient-conversation-summaries", () => ({
      getPatientConversationSummary: vi.fn().mockRejectedValue(new Error("d1 indisponivel")),
      upsertPatientConversationSummary: vi.fn(),
    }));
    const { recordPatientConversationTurn } = await import("../lib/ai/memory/patient-conversation-summary");
    await expect(recordPatientConversationTurn("client-A", { topic: "x" })).resolves.toBeUndefined();
  });
});

describe("lib/repositories/patient-conversation-summaries.ts — tabela propria, nunca ai_conversation_summaries", () => {
  it("consulta so a tabela patient_conversation_summaries, filtrando por client_id", async () => {
    // Um teste anterior neste arquivo faz doMock deste MESMO specifier — o
    // registro de doMock nao e limpo por resetModules()/clearAllMocks(),
    // entao precisa ser desfeito explicitamente para este teste importar a
    // implementacao real.
    vi.doUnmock("@/lib/repositories/patient-conversation-summaries");
    const d1Query = vi.fn().mockResolvedValue([]);
    const d1Execute = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute }));
    const { getPatientConversationSummary, upsertPatientConversationSummary } = await import("../lib/repositories/patient-conversation-summaries");

    await getPatientConversationSummary("client-A");
    expect(d1Query.mock.calls[0][0]).toContain("patient_conversation_summaries");
    expect(d1Query.mock.calls[0][0]).not.toContain("ai_conversation_summaries");
    expect(d1Query.mock.calls[0][1]).toEqual(["client-A"]);

    await upsertPatientConversationSummary("client-A", "novo resumo");
    expect(d1Execute).toHaveBeenCalled();
    expect(d1Execute.mock.calls[0][0]).toContain("patient_conversation_summaries");
  });
});
