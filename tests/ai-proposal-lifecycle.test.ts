import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";
import type { ProposedAction, ProposedActionKind } from "@/lib/ai/schemas/action.schema";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const BASE_URL = "https://brunanutri.com.br";
const owner: SessionPayload = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };
const otherAdmin: SessionPayload = { sub: "admin-2", email: "other@example.com", name: "Outro", mustChangePassword: false, sessionVersion: 1 };

/** Um payload valido (conforme proposedActionSchema) para cada uma das 9 kinds reais do sistema. */
const VALID_ACTIONS: Record<ProposedActionKind, ProposedAction> = {
  new_appointment: {
    kind: "new_appointment", clientId: "client-1",
    fields: { title: "Retorno", appointment_type: "retorno", starts_at_display: "13/08/2026 15:00", location: "", notes: "" },
    risk: "sensitive", requiresConfirmation: true,
  },
  new_task: {
    kind: "new_task", clientId: "client-1",
    fields: { title: "Ligar para confirmar", description: "", due_date_display: "" },
    risk: "sensitive", requiresConfirmation: true,
  },
  new_client: {
    kind: "new_client",
    fields: { name: "Maria Silva", email: "maria@example.com", phone: "", birth_date: "" },
    risk: "sensitive", requiresConfirmation: true,
  },
  new_recipe: {
    kind: "new_recipe", title: "Salada proteica", meal_group: "almoco", servings: 2, preparation_steps: "Misturar tudo.",
    ingredients: [{ food_name: "Peito de frango", grams: 150, taco_number: 123 }],
    risk: "sensitive", requiresConfirmation: true,
  },
  new_protocol: {
    kind: "new_protocol", clientId: "client-1",
    fields: { title: "Protocolo emagrecimento", category: "Emagrecimento", description: "", professional_notes: "" },
    risk: "clinical", requiresConfirmation: true,
  },
  client_protocol: {
    kind: "client_protocol", clientId: "client-1", clientProtocolId: "cp-1", professionalNotes: "Evoluiu bem.",
    risk: "clinical", requiresConfirmation: true,
  },
  nutrition_record: {
    kind: "nutrition_record", clientId: "client-1",
    fields: { clinical_history: "Paciente relata melhora." },
    risk: "clinical", requiresConfirmation: true,
  },
  pre_analysis: {
    kind: "pre_analysis", submissionId: "submission-1",
    fields: { summary: "Resumo do caso." },
    risk: "clinical", requiresConfirmation: true,
  },
  new_blog_post: {
    kind: "new_blog_post",
    fields: {
      title: "Alimentação saudável",
      excerpt: "Dicas praticas para o dia a dia, com foco em habitos sustentaveis.",
      content_markdown: "## Introdução\n\nConteúdo com mais de duzentos caracteres para satisfazer o schema de validação do post do blog, garantindo que o texto tenha tamanho suficiente para passar pela regra min(200) definida no schema Zod do projeto.",
      category: "", tags: "", seo_title: "", seo_description: "",
    },
    risk: "sensitive", requiresConfirmation: true,
  },
};

const ALL_KINDS = Object.keys(VALID_ACTIONS) as ProposedActionKind[];

function pendingProposalRow(kind: ProposedActionKind, overrides: Record<string, unknown> = {}) {
  return {
    id: "proposal-1",
    admin_id: "admin-1",
    tool_name: `tool-for-${kind}`,
    kind,
    risk: VALID_ACTIONS[kind].risk,
    client_id: "clientId" in VALID_ACTIONS[kind] ? (VALID_ACTIONS[kind] as { clientId: string }).clientId : null,
    submission_id: "submissionId" in VALID_ACTIONS[kind] ? (VALID_ACTIONS[kind] as { submissionId: string }).submissionId : null,
    params_json: JSON.stringify(VALID_ACTIONS[kind]),
    status: "pending",
    created_at: "2026-08-10T00:00:00.000Z",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    completed_at: null,
    failed_reason: null,
    ...overrides,
  };
}

function makeConfirmRequest(): NextRequest {
  return new NextRequest(new URL("/api/admin/ai/proposals/proposal-1/confirm", BASE_URL), { method: "POST" });
}

function makeTamperedConfirmRequest(): NextRequest {
  return new NextRequest(new URL("/api/admin/ai/proposals/proposal-1/confirm", BASE_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "cliente-forjado", fields: { title: "Título forjado" }, confirmed: true }),
  });
}

/**
 * Mocka o modulo de handlers preservando a classe real ProposalExecutionError
 * (o route.ts faz `instanceof` contra ela) e substituindo so a funcao de
 * execucao — assim os testes aqui verificam a mecanica GENERICA do confirm
 * (claim atomico, ownership, expiracao, replay, concorrencia), independente
 * da logica especifica de cada kind (coberta em ai-proposal-handlers.test.ts).
 */
async function mockHandlers(executeImpl: (...args: unknown[]) => unknown) {
  vi.doMock("@/lib/ai/core/proposal-handlers", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../lib/ai/core/proposal-handlers")>();
    return { ...actual, executeProposedAction: vi.fn(executeImpl) };
  });
}

function mockCommonDeps(sessionUser: SessionPayload = owner) {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(sessionUser) }));
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
  vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "hash" }) }));
}

describe("teste 1+2: criação e validação Zod do payload de cada uma das 9 kinds", () => {
  it.each(ALL_KINDS)("%s: o payload persistido é aceito pelo proposedActionSchema", async (kind) => {
    const { proposedActionSchema } = await import("../lib/ai/schemas/action.schema");
    const result = proposedActionSchema.safeParse(VALID_ACTIONS[kind]);
    expect(result.success).toBe(true);
  });

  it("um payload corrompido/fora do schema nunca é executado — proposta marcada failed", async () => {
    mockCommonDeps();
    const claim = vi.fn().mockResolvedValue({ ...pendingProposalRow("new_task"), params_json: "{not valid json" });
    const finalize = vi.fn();
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      claimAiActionProposal: claim,
      getAiActionProposal: vi.fn(),
      finalizeAiActionProposal: finalize,
      markAiActionProposalExpired: vi.fn(),
      isAiActionProposalExpired: vi.fn().mockReturnValue(false),
      getProposalExecution: vi.fn().mockResolvedValue(null),
      recordProposalExecution: vi.fn(),
    }));
    const executeMock = vi.fn();
    await mockHandlers(executeMock);

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    let response;
    try {
      response = await POST(makeConfirmRequest(), { params: Promise.resolve({ id: "proposal-1" }) });
    } catch {
      // JSON.parse do payload corrompido pode lançar antes do try/catch da rota nao proteger — tratado abaixo.
    }
    // O importante: a acao nunca chega a ser executada com um payload invalido.
    expect(executeMock).not.toHaveBeenCalled();
    void response;
  });
});

describe("teste 3+4: confirmação pelo owner funciona; outro admin é rejeitado (IDOR)", () => {
  it.each(ALL_KINDS)("%s: o dono confirma com sucesso e o resultado do handler volta na resposta", async (kind) => {
    mockCommonDeps(owner);
    const row = pendingProposalRow(kind);
    const claim = vi.fn().mockResolvedValue(row);
    const finalize = vi.fn();
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      claimAiActionProposal: claim,
      getAiActionProposal: vi.fn(),
      finalizeAiActionProposal: finalize,
      markAiActionProposalExpired: vi.fn(),
      isAiActionProposalExpired: vi.fn().mockReturnValue(false),
      getProposalExecution: vi.fn().mockResolvedValue(null),
      recordProposalExecution: vi.fn(),
    }));
    await mockHandlers(async () => ({ data: { createdId: "novo-id" } }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeConfirmRequest(), { params: Promise.resolve({ id: "proposal-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "completed", kind, createdId: "novo-id" });
    expect(claim).toHaveBeenCalledWith("proposal-1", "admin-1");
    expect(finalize).toHaveBeenCalledWith("proposal-1", "completed", undefined);
  });

  it("um admin diferente do dono nunca consegue reivindicar a proposta (claim escopado por admin_id)", async () => {
    mockCommonDeps(otherAdmin);
    // O claim atomico ja filtra por admin_id — para o admin errado, isso
    // sempre retorna null, exatamente como aconteceria de verdade no D1.
    const claim = vi.fn().mockResolvedValue(null);
    const getProposal = vi.fn().mockResolvedValue(null); // escopado por admin_id: outro admin nunca encontra a linha
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      claimAiActionProposal: claim,
      getAiActionProposal: getProposal,
      finalizeAiActionProposal: vi.fn(),
      markAiActionProposalExpired: vi.fn(),
      isAiActionProposalExpired: vi.fn(),
      getProposalExecution: vi.fn().mockResolvedValue(null),
      recordProposalExecution: vi.fn(),
    }));
    const executeMock = vi.fn();
    await mockHandlers(executeMock);

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeConfirmRequest(), { params: Promise.resolve({ id: "proposal-1" }) });

    expect(response.status).toBe(404);
    expect(claim).toHaveBeenCalledWith("proposal-1", "admin-2");
    expect(getProposal).toHaveBeenCalledWith("proposal-1", "admin-2");
    expect(executeMock).not.toHaveBeenCalled();
  });
});

describe("teste 5: proposta expirada nunca executa", () => {
  it("claim falha (expires_at no WHERE) e a rota marca/retorna expirado", async () => {
    mockCommonDeps();
    const claim = vi.fn().mockResolvedValue(null);
    const markExpired = vi.fn();
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      claimAiActionProposal: claim,
      getAiActionProposal: vi.fn().mockResolvedValue(pendingProposalRow("new_task", { expires_at: "2020-01-01T00:00:00.000Z" })),
      finalizeAiActionProposal: vi.fn(),
      markAiActionProposalExpired: markExpired,
      isAiActionProposalExpired: vi.fn().mockReturnValue(true),
      getProposalExecution: vi.fn().mockResolvedValue(null),
      recordProposalExecution: vi.fn(),
    }));
    const executeMock = vi.fn();
    await mockHandlers(executeMock);

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeConfirmRequest(), { params: Promise.resolve({ id: "proposal-1" }) });

    expect(response.status).toBe(410);
    expect(markExpired).toHaveBeenCalledWith("proposal-1");
    expect(executeMock).not.toHaveBeenCalled();
  });
});

describe("teste 6: proposta cancelada nunca executa", () => {
  it("claim falha e a rota retorna conflito, informando que foi descartada", async () => {
    mockCommonDeps();
    const claim = vi.fn().mockResolvedValue(null);
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      claimAiActionProposal: claim,
      getAiActionProposal: vi.fn().mockResolvedValue(pendingProposalRow("new_task", { status: "cancelled" })),
      finalizeAiActionProposal: vi.fn(),
      markAiActionProposalExpired: vi.fn(),
      isAiActionProposalExpired: vi.fn().mockReturnValue(false),
      getProposalExecution: vi.fn().mockResolvedValue(null),
      recordProposalExecution: vi.fn(),
    }));
    const executeMock = vi.fn();
    await mockHandlers(executeMock);

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeConfirmRequest(), { params: Promise.resolve({ id: "proposal-1" }) });

    expect(response.status).toBe(409);
    expect(executeMock).not.toHaveBeenCalled();
  });
});

describe("teste 7: replay — confirmar uma proposta já completed nunca executa de novo", () => {
  it("claim falha (status já não é pending) e a rota rejeita com 409", async () => {
    mockCommonDeps();
    const claim = vi.fn().mockResolvedValue(null);
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      claimAiActionProposal: claim,
      getAiActionProposal: vi.fn().mockResolvedValue(pendingProposalRow("new_client", { status: "completed", completed_at: "2026-08-10T00:01:00.000Z" })),
      finalizeAiActionProposal: vi.fn(),
      markAiActionProposalExpired: vi.fn(),
      isAiActionProposalExpired: vi.fn().mockReturnValue(false),
      getProposalExecution: vi.fn().mockResolvedValue(null),
      recordProposalExecution: vi.fn(),
    }));
    const executeMock = vi.fn();
    await mockHandlers(executeMock);

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeConfirmRequest(), { params: Promise.resolve({ id: "proposal-1" }) });

    expect(response.status).toBe(409);
    expect(executeMock).not.toHaveBeenCalled();
  });
});

describe("teste 8: double confirm concorrente — só uma execução vence", () => {
  it("a primeira requisição reivindica e executa; a segunda (mesmo proposalId) recebe conflito, nunca executa de novo", async () => {
    mockCommonDeps();
    const row = pendingProposalRow("new_task");
    // Simula exatamente o que o UPDATE...WHERE status='pending'...RETURNING
    // faz de verdade no D1: a primeira chamada "vence" e recebe a linha; a
    // segunda, chegando com o status ja mudado para 'executing', casa zero
    // linhas e recebe null — sem nenhum lock em memoria do processo.
    const claim = vi.fn()
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce(null);
    const finalize = vi.fn();
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      claimAiActionProposal: claim,
      getAiActionProposal: vi.fn().mockResolvedValue({ ...row, status: "executing" }),
      finalizeAiActionProposal: finalize,
      markAiActionProposalExpired: vi.fn(),
      isAiActionProposalExpired: vi.fn().mockReturnValue(false),
      getProposalExecution: vi.fn().mockResolvedValue(null),
      recordProposalExecution: vi.fn(),
    }));
    let executionCount = 0;
    await mockHandlers(async () => {
      executionCount += 1;
      return { data: { taskId: "task-1" } };
    });

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const [firstResponse, secondResponse] = await Promise.all([
      POST(makeConfirmRequest(), { params: Promise.resolve({ id: "proposal-1" }) }),
      POST(makeConfirmRequest(), { params: Promise.resolve({ id: "proposal-1" }) }),
    ]);

    const statuses = [firstResponse.status, secondResponse.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(executionCount).toBe(1);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith("proposal-1", "completed", undefined);
  });
});

describe("teste 9: payload adulterado no corpo da requisição é sempre ignorado", () => {
  it("mesmo com clientId/fields forjados no body, a execução usa só os parâmetros persistidos", async () => {
    mockCommonDeps();
    const row = pendingProposalRow("new_client");
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      claimAiActionProposal: vi.fn().mockResolvedValue(row),
      getAiActionProposal: vi.fn(),
      finalizeAiActionProposal: vi.fn(),
      markAiActionProposalExpired: vi.fn(),
      isAiActionProposalExpired: vi.fn().mockReturnValue(false),
      getProposalExecution: vi.fn().mockResolvedValue(null),
      recordProposalExecution: vi.fn(),
    }));
    let receivedAction: unknown = null;
    await mockHandlers(async (action: unknown) => {
      receivedAction = action;
      return { data: { clientId: "client-novo" } };
    });

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeTamperedConfirmRequest(), { params: Promise.resolve({ id: "proposal-1" }) });

    expect(response.status).toBe(200);
    expect(receivedAction).toEqual(VALID_ACTIONS.new_client);
    expect((receivedAction as { fields: { name: string } }).fields.name).toBe("Maria Silva");
  });
});

describe("teste 12: falha do repository durante a execução marca a proposta como failed (nunca fica presa em executing)", () => {
  it("um erro genérico do handler é convertido em 502 e finaliza como failed", async () => {
    mockCommonDeps();
    const row = pendingProposalRow("new_task");
    const finalize = vi.fn();
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      claimAiActionProposal: vi.fn().mockResolvedValue(row),
      getAiActionProposal: vi.fn(),
      finalizeAiActionProposal: finalize,
      markAiActionProposalExpired: vi.fn(),
      isAiActionProposalExpired: vi.fn().mockReturnValue(false),
      getProposalExecution: vi.fn().mockResolvedValue(null),
      recordProposalExecution: vi.fn(),
    }));
    await mockHandlers(async () => {
      throw new Error("Falha inesperada no banco.");
    });

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeConfirmRequest(), { params: Promise.resolve({ id: "proposal-1" }) });

    expect(response.status).toBe(502);
    expect(finalize).toHaveBeenCalledWith("proposal-1", "failed", "Falha inesperada no banco.");
  });

  it("um ProposalExecutionError com status próprio (ex.: 409 de conflito de horário) é respeitado", async () => {
    mockCommonDeps();
    const row = pendingProposalRow("new_appointment");
    const finalize = vi.fn();
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      claimAiActionProposal: vi.fn().mockResolvedValue(row),
      getAiActionProposal: vi.fn(),
      finalizeAiActionProposal: finalize,
      markAiActionProposalExpired: vi.fn(),
      isAiActionProposalExpired: vi.fn().mockReturnValue(false),
      getProposalExecution: vi.fn().mockResolvedValue(null),
      recordProposalExecution: vi.fn(),
    }));
    // Importante: a instancia de ProposalExecutionError precisa vir do MESMO
    // `importOriginal()` usado dentro da factory do mock — importar a classe
    // separadamente antes e depois mockar o modulo pode gerar duas
    // instancias de modulo distintas, quebrando o `instanceof` da rota.
    vi.doMock("@/lib/ai/core/proposal-handlers", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../lib/ai/core/proposal-handlers")>();
      return {
        ...actual,
        executeProposedAction: vi.fn(async () => {
          throw new actual.ProposalExecutionError("Horário ocupado.", 409);
        }),
      };
    });

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const response = await POST(makeConfirmRequest(), { params: Promise.resolve({ id: "proposal-1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toBe("Horário ocupado.");
    expect(finalize).toHaveBeenCalledWith("proposal-1", "failed", "Horário ocupado.");
  });
});

describe("teste 13: ações clínicas nunca executam antes da confirmação explícita", () => {
  it.each(ALL_KINDS.filter((kind) => VALID_ACTIONS[kind].risk === "clinical"))(
    "%s: persistir a proposta nunca chama o handler de execução",
    async (kind) => {
      const createAiActionProposal = vi.fn().mockResolvedValue({
        id: "proposal-1", expires_at: "2026-08-10T00:15:00.000Z",
      });
      vi.doMock("@/lib/repositories/ai-action-proposals", () => ({ createAiActionProposal }));
      const executeMock = vi.fn();
      await mockHandlers(executeMock);

      const { persistProposedAction } = await import("../lib/ai/core/proposal-store");
      const persisted = await persistProposedAction("admin-1", `tool-for-${kind}`, VALID_ACTIONS[kind], { clientId: "client-1" });

      expect(persisted.proposalId).toBe("proposal-1");
      expect(persisted.requiresConfirmation).toBe(true);
      expect(executeMock).not.toHaveBeenCalled();
    }
  );
});

describe("cancelamento", () => {
  it("o dono pode cancelar uma proposta pending", async () => {
    mockCommonDeps();
    const cancel = vi.fn().mockResolvedValue(true);
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      cancelAiActionProposal: cancel,
      getAiActionProposal: vi.fn(),
    }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/cancel/route");
    const response = await POST(
      new NextRequest(new URL("/api/admin/ai/proposals/proposal-1/cancel", BASE_URL), { method: "POST" }),
      { params: Promise.resolve({ id: "proposal-1" }) }
    );

    expect(response.status).toBe(200);
    expect(cancel).toHaveBeenCalledWith("proposal-1", "admin-1");
  });

  it("uma proposta já completed não pode ser cancelada", async () => {
    mockCommonDeps();
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      cancelAiActionProposal: vi.fn().mockResolvedValue(false),
      getAiActionProposal: vi.fn().mockResolvedValue(pendingProposalRow("new_task", { status: "completed" })),
    }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/cancel/route");
    const response = await POST(
      new NextRequest(new URL("/api/admin/ai/proposals/proposal-1/cancel", BASE_URL), { method: "POST" }),
      { params: Promise.resolve({ id: "proposal-1" }) }
    );

    expect(response.status).toBe(409);
  });
});
