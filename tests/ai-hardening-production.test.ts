import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Hardening final para producao — parte 8 do pedido (15 cenarios):
 * normalizacao/duplicidade de cliente, atomicidade de protocolo, e recovery
 * de proposals presas em 'executing'. As corridas entre DUAS proposals
 * diferentes (cenarios 1/2/3) ja estao em
 * tests/ai-proposal-cross-proposal-races.test.ts (secao 14, reescrita nesta
 * mesma rodada de hardening) — aqui cobrimos o restante.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const admin: SessionPayload = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };
const BASE_URL = "https://brunanutri.com.br";

function makeRequest(path: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(path, BASE_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function mockCommonDeps() {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(admin) }));
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
  vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "hash" }) }));
}

// ── normalizacao de identidade (cenarios 2/3/4) ──────────────────────────

describe("normalizeEmailIdentity / normalizePhoneIdentity", () => {
  it("email e case-insensitive e ignora espaços nas pontas", async () => {
    const { normalizeEmailIdentity } = await import("../lib/clinical/client-identity");
    expect(normalizeEmailIdentity("  Teste@Email.com ")).toBe("teste@email.com");
    expect(normalizeEmailIdentity(null)).toBeNull();
    expect(normalizeEmailIdentity("")).toBeNull();
  });

  it("telefone trata formatos diferentes do mesmo numero como equivalentes (cenario 3)", async () => {
    const { normalizePhoneIdentity } = await import("../lib/clinical/client-identity");
    const a = normalizePhoneIdentity("(48) 99999-9999");
    const b = normalizePhoneIdentity("48999999999");
    const c = normalizePhoneIdentity("+55 48 99999-9999");
    expect(a).toBe("48999999999");
    expect(b).toBe("48999999999");
    expect(c).toBe("48999999999");
  });

  it("mapClientConstraintError traduz a mensagem crua do D1 para erro de dominio, nunca expondo SQL (cenario 4)", async () => {
    const { mapClientConstraintError, ClientDuplicateError } = await import("../lib/clinical/client-identity");
    const emailError = mapClientConstraintError(new Error("UNIQUE constraint failed: clients.email_normalized: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)"));
    expect(emailError).toBeInstanceOf(ClientDuplicateError);
    expect(emailError?.message).not.toMatch(/SQLITE|UNIQUE|constraint/i);

    const phoneError = mapClientConstraintError(new Error("UNIQUE constraint failed: clients.phone_normalized: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)"));
    expect(phoneError?.field).toBe("phone");

    // Erro nao relacionado (outra constraint qualquer): retorna null — o
    // chamador deve relancar o erro original, nunca mascarar um erro real.
    expect(mapClientConstraintError(new Error("no such table: clients"))).toBeNull();
    expect(mapClientConstraintError("string qualquer")).toBeNull();
  });
});

// ── atomicidade de protocolo (cenarios 5/6/7) ────────────────────────────

describe("createProtocolAndApplyToClient — atomicidade (cenarios 5/6)", () => {
  it("cria protocolo + fases + vinculo numa unica chamada de d1Batch (nunca dois writes separados)", async () => {
    const d1Batch = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query: vi.fn(), d1Execute: vi.fn() }));
    const { createProtocolAndApplyToClient } = await import("../lib/repositories/client-protocols");

    const result = await createProtocolAndApplyToClient({
      title: "Protocolo emagrecimento",
      kind: "personalized",
      clientId: "client-1",
      createdBy: "admin-1",
      phases: [{ title: "Fase 1", actions: ["Beber 2L de água"] }],
      apply: { professionalNotes: "Notas" },
    });

    expect(result.protocolId).toBeTruthy();
    expect(result.clientProtocolId).toBeTruthy();
    // Uma unica chamada de batch = uma unica transacao atomica no D1 — se
    // qualquer statement dela falhar, NENHUM dos outros e aplicado (nunca um
    // protocolo criado sem client_protocols apontando pra ele).
    expect(d1Batch).toHaveBeenCalledTimes(1);
    const statements = d1Batch.mock.calls[0][0] as Array<{ sql: string }>;
    expect(statements.some((s) => s.sql.includes("INSERT INTO protocols"))).toBe(true);
    expect(statements.some((s) => s.sql.includes("INSERT INTO protocol_phases"))).toBe(true);
    expect(statements.some((s) => s.sql.includes("INSERT INTO client_protocols"))).toBe(true);
  });

  it("se a escrita atomica falhar, a funcao rejeita e nenhum id e retornado — zero protocolo orfao", async () => {
    const d1Batch = vi.fn().mockRejectedValue(new Error("D1 indisponível"));
    vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query: vi.fn(), d1Execute: vi.fn() }));
    const { createProtocolAndApplyToClient } = await import("../lib/repositories/client-protocols");

    await expect(createProtocolAndApplyToClient({
      title: "Protocolo", kind: "personalized", clientId: "client-1", phases: [],
    })).rejects.toThrow("D1 indisponível");
    // Como so existe UMA chamada (d1Batch), uma falha nela nunca deixa o
    // protocolo criado e o vinculo faltando — ou os dois foram, ou nenhum.
    expect(d1Batch).toHaveBeenCalledTimes(1);
  });

  it("executeNewProtocol usa a operacao atomica compartilhada — mesma funcao para IA e cadastro manual (secao 2.3)", async () => {
    const routeSource = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../app/api/admin/clients/[id]/protocols/route.ts", import.meta.url), "utf8")
    );
    const handlerSource = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../lib/ai/core/proposal-handlers.ts", import.meta.url), "utf8")
    );
    expect(routeSource).toContain("createProtocolAndApplyToClient");
    expect(handlerSource).toContain("createProtocolAndApplyToClient");
  });
});

// ── recovery-policy: classificacao por kind ──────────────────────────────

describe("recovery-policy — classificacao automatic vs manual", () => {
  it("kinds so-INSERT sem chave de identidade amarrada ao pedido sao manual", async () => {
    const { getRecoveryStrategy } = await import("../lib/ai/policies/recovery-policy");
    for (const kind of ["new_appointment", "new_task", "new_recipe", "new_protocol", "new_blog_post", "patient_appointment_request"]) {
      expect(getRecoveryStrategy(kind)).toBe("manual");
    }
  });

  it("kinds com guard amarrado a identidade do proprio pedido sao automatic", async () => {
    const { getRecoveryStrategy } = await import("../lib/ai/policies/recovery-policy");
    for (const kind of ["new_client", "client_protocol", "nutrition_record", "pre_analysis", "meal_plan_change", "patient_change_request"]) {
      expect(getRecoveryStrategy(kind)).toBe("automatic");
    }
  });

  it("kind desconhecida (linha antiga/adulterada) cai em manual — falha fechado", async () => {
    const { getRecoveryStrategy } = await import("../lib/ai/policies/recovery-policy");
    expect(getRecoveryStrategy("kind_que_nao_existe")).toBe("manual");
  });
});

// ── recovery: rotas admin ────────────────────────────────────────────────

class FakeRecoveryDb {
  rows = new Map<string, {
    id: string; admin_id: string; kind: string; status: string; params_json: string;
    executing_at: string | null; created_at: string; expires_at: string;
  }>();
  executions = new Map<string, Record<string, unknown>>();

  seed(row: { id: string; admin_id: string; kind: string; status: string; params_json: string; executing_at?: string | null; created_at?: string }) {
    this.rows.set(row.id, {
      id: row.id, admin_id: row.admin_id, kind: row.kind, status: row.status, params_json: row.params_json,
      executing_at: row.executing_at ?? null, created_at: row.created_at ?? new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
  }

  async getById(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async reclaim(id: string, thresholdMs = 120_000) {
    const row = this.rows.get(id);
    if (!row || row.status !== "executing" || !row.executing_at) return null;
    if (new Date(row.executing_at).getTime() >= Date.now() - thresholdMs) return null;
    row.executing_at = new Date().toISOString();
    return { ...row };
  }

  async getExecution(id: string) {
    const result = this.executions.get(id);
    return result ? { proposal_id: id, kind: "x", result_json: JSON.stringify(result) } : null;
  }

  async recordExecution(id: string, _kind: string, result: Record<string, unknown>) {
    if (!this.executions.has(id)) this.executions.set(id, result);
  }

  async finalize(id: string, status: string, reason?: string | null) {
    const row = this.rows.get(id);
    if (row && row.status === "executing") { row.status = status; void reason; }
  }

  async markRequiresReview(id: string) {
    const row = this.rows.get(id);
    if (row && row.status === "executing") row.status = "requires_review";
  }

  async resolveRequiresReview(id: string, resolution: "not_applied" | "already_applied") {
    const row = this.rows.get(id);
    if (row && row.status === "requires_review") row.status = resolution === "already_applied" ? "completed" : "failed";
  }
}

function mockRecoveryRepo(db: FakeRecoveryDb) {
  vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
    getAiActionProposalById: (id: string) => db.getById(id),
    reclaimStuckExecutingProposal: (id: string) => db.reclaim(id),
    getProposalExecution: (id: string) => db.getExecution(id),
    recordProposalExecution: (id: string, kind: string, result: Record<string, unknown>) => db.recordExecution(id, kind, result),
    finalizeAiActionProposal: (id: string, status: string, reason?: string | null) => db.finalize(id, status, reason),
    markProposalRequiresReview: (id: string) => db.markRequiresReview(id),
    resolveRequiresReview: (id: string, resolution: "not_applied" | "already_applied") => db.resolveRequiresReview(id, resolution),
    listProposalsNeedingRecovery: vi.fn().mockResolvedValue([]),
  }));
}

const staleExecutingAt = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5min atrás, além do limiar de 2min
const freshExecutingAt = new Date().toISOString();

describe("POST /api/admin/ai/proposals/[id]/recover", () => {
  it("cenario 13: paciente (sem sessao admin) nunca acessa a rota de recovery", async () => {
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(null) }));
    const db = new FakeRecoveryDb();
    mockRecoveryRepo(db);
    const { POST } = await import("../app/api/admin/ai/proposals/[id]/recover/route");
    const response = await POST(makeRequest("/api/admin/ai/proposals/p1/recover", {}), { params: Promise.resolve({ id: "p1" }) });
    expect(response.status).toBe(401);
  });

  it("cenario 14/15: proposta 'pending' (nunca confirmada) nao e alvo de recovery — 409, nunca reabre confirmacao", async () => {
    mockCommonDeps();
    const db = new FakeRecoveryDb();
    db.seed({ id: "p1", admin_id: "admin-1", kind: "new_task", status: "pending", params_json: "{}" });
    mockRecoveryRepo(db);
    const { POST } = await import("../app/api/admin/ai/proposals/[id]/recover/route");
    const response = await POST(makeRequest("/api/admin/ai/proposals/p1/recover", {}), { params: Promise.resolve({ id: "p1" }) });
    expect(response.status).toBe(409);
  });

  it("'executing' ainda dentro do limiar (nao presa de verdade) — 409, nunca interfere numa confirmacao em andamento", async () => {
    mockCommonDeps();
    const db = new FakeRecoveryDb();
    db.seed({ id: "p1", admin_id: "admin-1", kind: "new_task", status: "executing", executing_at: freshExecutingAt, params_json: "{}" });
    mockRecoveryRepo(db);
    const { POST } = await import("../app/api/admin/ai/proposals/[id]/recover/route");
    const response = await POST(makeRequest("/api/admin/ai/proposals/p1/recover", {}), { params: Promise.resolve({ id: "p1" }) });
    expect(response.status).toBe(409);
  });

  it("cenario 9: 'executing' presa COM registro de execucao — side effect provado, so finaliza (nunca re-executa)", async () => {
    mockCommonDeps();
    const db = new FakeRecoveryDb();
    db.seed({ id: "p1", admin_id: "admin-1", kind: "new_task", status: "executing", executing_at: staleExecutingAt, params_json: JSON.stringify({ kind: "new_task", clientId: "c1", fields: {}, risk: "sensitive", requiresConfirmation: true }) });
    db.executions.set("p1", { taskId: "task-real-1" });
    mockRecoveryRepo(db);
    const createClientTask = vi.fn();
    vi.doMock("@/lib/repositories/client-tasks", () => ({ createClientTask }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/recover/route");
    const response = await POST(makeRequest("/api/admin/ai/proposals/p1/recover", {}), { params: Promise.resolve({ id: "p1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "completed", kind: "new_task", taskId: "task-real-1" });
    expect(createClientTask).not.toHaveBeenCalled(); // nunca re-executa o handler quando ja ha prova
    expect(db.rows.get("p1")?.status).toBe("completed");
  });

  it("cenario 8: 'executing' presa SEM registro e kind manual (new_task) — vira requires_review, nunca cria a tarefa cegamente", async () => {
    mockCommonDeps();
    const db = new FakeRecoveryDb();
    db.seed({ id: "p1", admin_id: "admin-1", kind: "new_task", status: "executing", executing_at: staleExecutingAt, params_json: JSON.stringify({ kind: "new_task", clientId: "c1", fields: { title: "Tarefa" }, risk: "sensitive", requiresConfirmation: true }) });
    mockRecoveryRepo(db);
    const createClientTask = vi.fn();
    vi.doMock("@/lib/repositories/client-tasks", () => ({ createClientTask }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "c1" }) }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/recover/route");
    const response = await POST(makeRequest("/api/admin/ai/proposals/p1/recover", {}), { params: Promise.resolve({ id: "p1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "requires_review" });
    expect(createClientTask).not.toHaveBeenCalled();
    expect(db.rows.get("p1")?.status).toBe("requires_review");
  });

  it("cenario 11: 'executing' presa SEM registro, kind automatic (new_client), o INSERT ja tinha acontecido — recovery relata falha, nunca duplica", async () => {
    mockCommonDeps();
    const action = { kind: "new_client", fields: { name: "Maria", email: "maria@example.com", phone: "", birth_date: "" }, risk: "sensitive", requiresConfirmation: true };
    const db = new FakeRecoveryDb();
    db.seed({ id: "p1", admin_id: "admin-1", kind: "new_client", status: "executing", executing_at: staleExecutingAt, params_json: JSON.stringify(action) });
    mockRecoveryRepo(db);
    const { ClientDuplicateError } = await import("../lib/clinical/client-identity");
    vi.doMock("@/lib/repositories/clients", () => ({
      getClients: vi.fn().mockResolvedValue({ items: [] }),
      createClient: vi.fn().mockRejectedValue(new ClientDuplicateError("email")),
    }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/recover/route");
    const response = await POST(makeRequest("/api/admin/ai/proposals/p1/recover", {}), { params: Promise.resolve({ id: "p1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toContain("Já existe um paciente cadastrado com esse e-mail");
    expect(db.rows.get("p1")?.status).toBe("failed"); // nunca fica presa, nunca reporta sucesso falso
  });

  it("kind automatic (new_client) onde nada tinha acontecido de fato — recovery completa com sucesso", async () => {
    mockCommonDeps();
    const action = { kind: "new_client", fields: { name: "Maria", email: "maria2@example.com", phone: "", birth_date: "" }, risk: "sensitive", requiresConfirmation: true };
    const db = new FakeRecoveryDb();
    db.seed({ id: "p1", admin_id: "admin-1", kind: "new_client", status: "executing", executing_at: staleExecutingAt, params_json: JSON.stringify(action) });
    mockRecoveryRepo(db);
    vi.doMock("@/lib/repositories/clients", () => ({
      getClients: vi.fn().mockResolvedValue({ items: [] }),
      createClient: vi.fn().mockResolvedValue("client-novo-1"),
    }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/recover/route");
    const response = await POST(makeRequest("/api/admin/ai/proposals/p1/recover", {}), { params: Promise.resolve({ id: "p1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "completed", kind: "new_client", clientId: "client-novo-1" });
    expect(db.rows.get("p1")?.status).toBe("completed");
  });

  it("cenario 12: 'requires_review' aceita a resolucao apurada manualmente e nunca re-executa nada", async () => {
    mockCommonDeps();
    const db = new FakeRecoveryDb();
    db.seed({ id: "p1", admin_id: "admin-1", kind: "new_appointment", status: "requires_review", params_json: JSON.stringify({ kind: "new_appointment", clientId: "c1", fields: {}, risk: "sensitive", requiresConfirmation: true }) });
    mockRecoveryRepo(db);
    const createAppointment = vi.fn();
    vi.doMock("@/lib/repositories/appointments", () => ({ createAppointment, getAppointments: vi.fn() }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/recover/route");
    const response = await POST(makeRequest("/api/admin/ai/proposals/p1/recover", { resolution: "already_applied" }), { params: Promise.resolve({ id: "p1" }) });

    expect(response.status).toBe(200);
    expect(createAppointment).not.toHaveBeenCalled();
    expect(db.rows.get("p1")?.status).toBe("completed");
  });

  it("proposta originada pelo PATIENT_ASSISTANT (admin_id = clientId da paciente, nao um admin real) e visivel e recuperavel pela nutricionista", async () => {
    // Regressao do proprio hardening: se a rota de recovery filtrasse por
    // admin_id = id do admin logado (como getAiActionProposal faz nos
    // fluxos normais), esta proposta NUNCA apareceria — patient_change_request
    // grava o clientId da paciente na coluna admin_id (convencao ja
    // estabelecida). A ferramenta de recovery precisa enxergar isso mesmo
    // assim, pois e a nutricionista quem verifica, nunca a paciente.
    mockCommonDeps();
    const db = new FakeRecoveryDb();
    db.seed({
      id: "p1", admin_id: "client-paciente-1", kind: "patient_change_request", status: "executing",
      executing_at: staleExecutingAt,
      params_json: JSON.stringify({
        kind: "patient_change_request", clientId: "client-paciente-1", requestType: "food_substitution",
        patientText: "Quero trocar a banana por maçã.", preview: { title: "Substituição alimentar", details: null },
        risk: "sensitive", requiresConfirmation: true,
      }),
    });
    mockRecoveryRepo(db);
    const createPatientRequest = vi.fn().mockResolvedValue("request-1");
    vi.doMock("@/lib/repositories/patient-requests", () => ({
      createPatientRequest,
      findSimilarPendingPatientRequest: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-paciente-1", name: "Maria" }) }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/recover/route");
    const response = await POST(makeRequest("/api/admin/ai/proposals/p1/recover", {}), { params: Promise.resolve({ id: "p1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "completed", kind: "patient_change_request", requestId: "request-1" });
    expect(db.rows.get("p1")?.status).toBe("completed");
  });

  it("'requires_review' sem informar resolution -> 400, nunca decide sozinho", async () => {
    mockCommonDeps();
    const db = new FakeRecoveryDb();
    db.seed({ id: "p1", admin_id: "admin-1", kind: "new_appointment", status: "requires_review", params_json: "{}" });
    mockRecoveryRepo(db);
    const { POST } = await import("../app/api/admin/ai/proposals/[id]/recover/route");
    const response = await POST(makeRequest("/api/admin/ai/proposals/p1/recover", {}), { params: Promise.resolve({ id: "p1" }) });
    expect(response.status).toBe(400);
  });
});

describe("GET /api/admin/ai/proposals/recovery — cenario 12 (admin identifica recovery, sem detalhe tecnico)", () => {
  it("nunca inclui executing_at, params_json ou qualquer campo tecnico bruto na resposta", async () => {
    mockCommonDeps();
    const listProposalsNeedingRecovery = vi.fn().mockResolvedValue([
      { id: "p1", admin_id: "admin-1", kind: "new_appointment", status: "executing", client_id: "c1", params_json: JSON.stringify({ fields: { starts_at_display: "13/08/2026 15:00" } }), executing_at: staleExecutingAt, created_at: new Date().toISOString(), expires_at: new Date().toISOString(), completed_at: null, failed_reason: null, submission_id: null, risk: "sensitive", tool_name: "proposeNewAppointment" },
    ]);
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({ listProposalsNeedingRecovery }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "c1", name: "Maria Silva" }) }));

    const { GET } = await import("../app/api/admin/ai/proposals/recovery/route");
    const response = await GET(makeRequest("/api/admin/ai/proposals/recovery"));
    const body = await response.json();

    expect(body.items).toEqual([{
      id: "p1", kind: "new_appointment", kindLabel: "Criação de agendamento", status: "executing",
      clientName: "Maria Silva", detail: "13/08/2026 15:00", createdAt: expect.any(String),
    }]);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("executing_at");
    expect(raw).not.toContain("params_json");
    expect(raw).not.toContain("proposeNewAppointment");
  });

  it("cenario 13: sem sessao admin, 401", async () => {
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(null) }));
    const { GET } = await import("../app/api/admin/ai/proposals/recovery/route");
    const response = await GET(makeRequest("/api/admin/ai/proposals/recovery"));
    expect(response.status).toBe(401);
  });
});
