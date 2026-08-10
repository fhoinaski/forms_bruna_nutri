import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";
import type { ProposedAction } from "@/lib/ai/schemas/action.schema";

/**
 * Secao 34 (o ponto mais dificil da auditoria adversarial): side effect
 * ocorreu de verdade, mas finalize(completed) nunca rodou (crash/timeout
 * logo apos). Isolado em arquivo proprio pelo mesmo motivo de
 * ai-proposal-cross-proposal-races.test.ts — o mock bem especifico de
 * `finalizeAiActionProposal` (com contagem de chamadas para simular a
 * "morte" do processo) sofria poluicao ao rodar junto de muitos outros
 * `vi.doMock` do mesmo specifier no arquivo principal.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const BASE_URL = "https://brunanutri.com.br";
const owner: SessionPayload = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, BASE_URL), { method: "POST" });
}

function mockCommonDeps() {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(owner) }));
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
  vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "hash" }) }));
}

class FakeProposalsDb {
  private rows = new Map<string, { id: string; admin_id: string; status: string; params_json: string; expires_at: string }>();
  private executions = new Map<string, Record<string, unknown>>();

  seed(row: { id: string; admin_id: string; status?: string; params_json: string; expires_at?: string }) {
    this.rows.set(row.id, {
      id: row.id, admin_id: row.admin_id, status: row.status ?? "pending",
      params_json: row.params_json, expires_at: row.expires_at ?? new Date(Date.now() + 60_000).toISOString(),
    });
  }

  async claim(id: string, adminId: string) {
    const row = this.rows.get(id);
    if (!row) return null;
    if (row.admin_id !== adminId) return null;
    if (row.status !== "pending") return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) return null;
    row.status = "executing";
    return { ...row };
  }

  async cancel(id: string, adminId: string) {
    const row = this.rows.get(id);
    if (!row || row.admin_id !== adminId || row.status !== "pending") return false;
    row.status = "cancelled";
    return true;
  }

  async finalize(id: string, status: "completed" | "failed") {
    const row = this.rows.get(id);
    if (!row || row.status !== "executing") return;
    row.status = status;
  }

  async get(id: string, adminId: string) {
    const row = this.rows.get(id);
    if (!row || row.admin_id !== adminId) return null;
    return { ...row };
  }

  async getExecution(id: string) {
    const result = this.executions.get(id);
    return result ? { proposal_id: id, kind: "x", result_json: JSON.stringify(result) } : null;
  }

  async recordExecution(id: string, _kind: string, result: Record<string, unknown>) {
    if (!this.executions.has(id)) this.executions.set(id, result);
  }

  statusOf(id: string) {
    return this.rows.get(id)?.status;
  }
}

function mockDbBackedRepo(db: FakeProposalsDb) {
  vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
    claimAiActionProposal: (id: string, adminId: string) => db.claim(id, adminId),
    cancelAiActionProposal: (id: string, adminId: string) => db.cancel(id, adminId),
    finalizeAiActionProposal: (id: string, status: "completed" | "failed") => db.finalize(id, status),
    getAiActionProposal: (id: string, adminId: string) => db.get(id, adminId),
    markAiActionProposalExpired: vi.fn(),
    isAiActionProposalExpired: () => false,
    getProposalExecution: (id: string) => db.getExecution(id),
    recordProposalExecution: (id: string, kind: string, result: Record<string, unknown>) => db.recordExecution(id, kind, result),
  }));
}

const taskAction: ProposedAction = {
  kind: "new_task", clientId: "client-1",
  fields: { title: "Ligar", description: "", due_date_display: "" },
  risk: "sensitive", requiresConfirmation: true,
};

describe("teste 34 (o mais importante): side effect ocorreu mas finalize(completed) nunca rodou", () => {
  it("a resposta ao usuário reflete o sucesso real do side effect mesmo que o bookkeeping (finalize) falhe", async () => {
    mockCommonDeps();
    const db = new FakeProposalsDb();
    db.seed({ id: "proposal-1", admin_id: "admin-1", params_json: JSON.stringify(taskAction) });
    mockDbBackedRepo(db);

    let executionCount = 0;
    vi.doMock("@/lib/ai/core/proposal-handlers", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../lib/ai/core/proposal-handlers")>();
      return {
        ...actual,
        executeProposedAction: vi.fn(async () => {
          executionCount += 1;
          return { data: { taskId: "task-real-1" } };
        }),
      };
    });

    // Mocka finalize para "morrer" (lançar) na primeira chamada — simula o
    // processo sendo encerrado bem depois de recordProposalExecution ja ter
    // rodado com sucesso (dentro do mesmo try, antes do finalize), mas
    // antes de finalize(completed) conseguir aplicar a transicao final.
    let finalizeCalls = 0;
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      claimAiActionProposal: (id: string, adminId: string) => db.claim(id, adminId),
      cancelAiActionProposal: (id: string, adminId: string) => db.cancel(id, adminId),
      finalizeAiActionProposal: async (id: string, status: "completed" | "failed") => {
        finalizeCalls += 1;
        if (finalizeCalls === 1) {
          throw new Error("processo encerrado (simulação de crash)");
        }
        return db.finalize(id, status);
      },
      getAiActionProposal: (id: string, adminId: string) => db.get(id, adminId),
      markAiActionProposalExpired: vi.fn(),
      isAiActionProposalExpired: () => false,
      getProposalExecution: (id: string) => db.getExecution(id),
      recordProposalExecution: (id: string, kind: string, result: Record<string, unknown>) => db.recordExecution(id, kind, result),
    }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");

    // 1ª chamada: o handler executa e cria a tarefa DE VERDADE, e a chave de
    // idempotencia e gravada — so o finalize(completed), que e so
    // bookkeeping, "morre" (simula o processo sendo encerrado bem ali). A
    // rota NUNCA deve transformar isso num erro reportado ao usuario: o
    // side effect ja e real e ja esta gravado de forma durave.
    const firstResponse = await POST(makeRequest("/api/admin/ai/proposals/proposal-1/confirm"), {
      params: Promise.resolve({ id: "proposal-1" }),
    });
    const firstBody = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstBody).toEqual({ status: "completed", kind: "new_task", taskId: "task-real-1" });
    expect(executionCount).toBe(1);
    // Estado real apos o "crash" do bookkeeping: a proposta fica presa em
    // executing (diagnosticavel via executing_at) mesmo com a resposta ao
    // usuario correta. Isto e exatamente o cenario da secao 8 — e a razao
    // pela qual failed_reason/executing_at existem para diagnostico manual.
    expect(db.statusOf("proposal-1")).toBe("executing");

    // Recuperacao MANUAL (nunca automatica nesta arquitetura — ver
    // docs/AI-ARCHITECTURE.md): um operador confirma, pela chave de
    // idempotencia, que o side effect ja aconteceu.
    const recovered = await db.get("proposal-1", "admin-1");
    expect(recovered?.status).toBe("executing");
    const executionRecord = await db.getExecution("proposal-1");
    expect(executionRecord).not.toBeNull();
    expect(JSON.parse(executionRecord!.result_json)).toEqual({ taskId: "task-real-1" });

    // Ponto central do teste: mesmo que o processo tivesse sobrevivido e
    // tentado executar de novo (ou um operador reabra manualmente a
    // proposta e o confirm rode outra vez), o handler NUNCA seria chamado
    // uma segunda vez, porque a rota checa `getProposalExecution` antes de
    // chamar `executeProposedAction`. Provamos isso simulando a reabertura
    // manual (claim forcado a suceder) e confirmando que a contagem de
    // execucoes NAO sobe.
    db.claim = async (id: string, adminId: string) => {
      const row = await db.get(id, adminId);
      if (!row) return null;
      return { ...row, status: "executing" };
    };
    const retryResponse = await POST(makeRequest("/api/admin/ai/proposals/proposal-1/confirm"), {
      params: Promise.resolve({ id: "proposal-1" }),
    });
    const retryBody = await retryResponse.json();

    expect(executionCount).toBe(1); // continua 1 — nao subiu
    expect(retryBody).toEqual({ status: "completed", kind: "new_task", taskId: "task-real-1" });
  });
});
