import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MealPlanPayload } from "@/lib/repositories/meal-plans";
import type { Appointment } from "@/lib/repositories/appointments";
import type { ClientPortalSession } from "@/lib/auth/client-portal-session";
import type { ProposedAction } from "@/lib/ai/schemas/action.schema";

/**
 * patient_change_request — secao 34/35 do pedido de solicitacoes: criacao
 * propria, confirmacao obrigatoria, cancelamento, replay, IDOR em cada
 * referencia (mealPlan/meal/item/appointment/task), kind administrativa
 * rejeitada, duplicate request, admin lista/filtra/marca status, paciente
 * nunca ve admin_notes, e a GARANTIA PRINCIPAL: nunca chama
 * updateMealPlan/updateNutritionRecord.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function makePlan(overrides: Partial<MealPlanPayload> = {}): MealPlanPayload {
  return {
    id: "plan-1", client_id: "client-A", title: "Plano da Maria", target_group: null,
    status: "active", version: 2, notes: null, created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z",
    meals: [
      { id: "meal-1", name: "Lanche da tarde", suggested_time: "15:00", notes: null, source_recipe_id: null, items: [{ id: "item-1", food: "Banana, da terra, crua", quantity: "100", unit: "g", notes: null }] },
    ],
    weekly_slots: [], substitutions: [], supplements: [],
    ...overrides,
  };
}

// ── tool: executeRequestProfessionalReview (ownership na criacao) ───────

describe("executeRequestProfessionalReview — ownership de cada referencia", () => {
  it("food_substitution com mealId/itemId reais monta preview com o alimento atual e o desejado", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlan()) }));
    const { executeRequestProfessionalReview } = await import("../lib/ai/agents/patient/patient-request-agent");
    const result = await executeRequestProfessionalReview("client-A", {
      requestType: "food_substitution", patientText: "Quero trocar a banana por maçã.",
      desiredFood: "Maçã", mealPlanId: "plan-1", mealId: "meal-1", itemId: "item-1",
    });
    expect(result).toMatchObject({
      clientId: "client-A", mealPlanId: "plan-1", mealId: "meal-1", itemId: "item-1",
      preview: { title: "Substituição alimentar", details: "Lanche da tarde: Banana, da terra, crua (100g) → Maçã" },
    });
  });

  it("mealId que nao pertence ao plano do cliente → error, nunca monta a proposta", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlan()) }));
    const { executeRequestProfessionalReview } = await import("../lib/ai/agents/patient/patient-request-agent");
    const result = await executeRequestProfessionalReview("client-A", {
      requestType: "food_substitution", patientText: "x", mealId: "meal-DE-OUTRO-PACIENTE",
    });
    expect(result).toEqual({ error: "Essa refeição não pertence ao seu plano atual." });
  });

  it("itemId que nao pertence aquela refeicao → error", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlan()) }));
    const { executeRequestProfessionalReview } = await import("../lib/ai/agents/patient/patient-request-agent");
    const result = await executeRequestProfessionalReview("client-A", {
      requestType: "food_substitution", patientText: "x", mealId: "meal-1", itemId: "item-DE-OUTRO-PACIENTE",
    });
    expect(result).toEqual({ error: "Esse item não pertence a essa refeição." });
  });

  it("appointmentId que nao pertence ao paciente → error", async () => {
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn() }));
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments: vi.fn().mockResolvedValue([{ id: "apt-de-A" }]) }));
    const { executeRequestProfessionalReview } = await import("../lib/ai/agents/patient/patient-request-agent");
    const result = await executeRequestProfessionalReview("client-A", {
      requestType: "appointment_request", patientText: "x", appointmentId: "apt-de-B",
    });
    expect(result).toEqual({ error: "Essa consulta não pertence a você." });
  });

  it("clientTaskId que nao pertence ao paciente → error", async () => {
    vi.doMock("@/lib/repositories/client-tasks", () => ({ getClientTasks: vi.fn().mockResolvedValue([{ id: "task-de-A" }]) }));
    const { executeRequestProfessionalReview } = await import("../lib/ai/agents/patient/patient-request-agent");
    const result = await executeRequestProfessionalReview("client-A", {
      requestType: "task_difficulty", patientText: "x", clientTaskId: "task-de-B",
    });
    expect(result).toEqual({ error: "Essa tarefa não pertence a você." });
  });

  it("symptom_or_complaint sem nenhuma referencia funciona normalmente (relato livre, sem vinculo)", async () => {
    const { executeRequestProfessionalReview } = await import("../lib/ai/agents/patient/patient-request-agent");
    const result = await executeRequestProfessionalReview("client-A", {
      requestType: "symptom_or_complaint", patientText: "Estou com muita fome à noite.",
    });
    expect(result).toMatchObject({ clientId: "client-A", requestType: "symptom_or_complaint", preview: { details: null } });
  });
});

// ── builder ───────────────────────────────────────────────────────────

describe("buildProposedAction — requestProfessionalReview", () => {
  it("clientId do contexto precisa bater com o clientId resolvido pela tool", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const result = buildProposedAction("requestProfessionalReview", {}, { clientId: "client-B" }, {
      clientId: "client-A", requestType: "general_question", patientText: "x", aiSummary: null,
      mealPlanId: null, mealId: null, itemId: null, appointmentId: null, clientTaskId: null,
      preview: { title: "Dúvida geral", details: null },
    });
    expect(result).toBeNull();
  });

  it("quando a tool devolve error, builder retorna null (analise/erro nunca vira proposta)", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    expect(buildProposedAction("requestProfessionalReview", {}, { clientId: "client-A" }, { error: "x" })).toBeNull();
  });
});

// ── handler: executePatientChangeRequest ─────────────────────────────────

function validAction(overrides: Partial<ProposedAction> = {}): ProposedAction {
  return {
    kind: "patient_change_request", clientId: "client-A", requestType: "food_substitution",
    patientText: "Quero trocar a banana por maçã.",
    preview: { title: "Substituição alimentar", details: "Lanche da tarde: Banana (100g) → Maçã" },
    risk: "sensitive", requiresConfirmation: true,
    ...overrides,
  } as ProposedAction;
}

describe("executeProposedAction — patient_change_request (GARANTIA PRINCIPAL)", () => {
  it("kind é sensitive, nunca clinical — paciente não possui capability clínica", () => {
    expect(validAction().risk).toBe("sensitive");
  });

  it("caminho feliz: cria a linha em patient_requests e NUNCA chama updateMealPlan/updateNutritionRecord", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria" }) }));
    const updateMealPlan = vi.fn();
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlan()), updateMealPlan }));
    const updateNutritionRecord = vi.fn();
    vi.doMock("@/lib/repositories/nutrition-records", () => ({ updateNutritionRecord }));
    const createPatientRequest = vi.fn().mockResolvedValue("request-1");
    vi.doMock("@/lib/repositories/patient-requests", () => ({
      createPatientRequest,
      findSimilarPendingPatientRequest: vi.fn().mockResolvedValue(null),
    }));

    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const result = await executeProposedAction(validAction({ mealPlanId: "plan-1", mealId: "meal-1", itemId: "item-1" }), { adminId: "client-A" });

    expect(createPatientRequest).toHaveBeenCalledWith(expect.objectContaining({ clientId: "client-A", requestType: "food_substitution" }));
    expect(result).toEqual({ data: { requestId: "request-1" } });
    expect(updateMealPlan).not.toHaveBeenCalled();
    expect(updateNutritionRecord).not.toHaveBeenCalled();
  });

  it("mealPlanId que nao e o plano ativo do cliente → 403, nunca cria o pedido", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlan({ id: "outro-plano" })) }));
    const createPatientRequest = vi.fn();
    vi.doMock("@/lib/repositories/patient-requests", () => ({ createPatientRequest, findSimilarPendingPatientRequest: vi.fn() }));

    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(validAction({ mealPlanId: "plan-1" }), { adminId: "client-A" })).rejects.toMatchObject({ status: 403 });
    expect(createPatientRequest).not.toHaveBeenCalled();
  });

  it("mealId que nao existe no plano atual → 422", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(makePlan()) }));
    const createPatientRequest = vi.fn();
    vi.doMock("@/lib/repositories/patient-requests", () => ({ createPatientRequest, findSimilarPendingPatientRequest: vi.fn() }));

    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(validAction({ mealPlanId: "plan-1", mealId: "meal-fantasma" }), { adminId: "client-A" }))
      .rejects.toMatchObject({ status: 422 });
    expect(createPatientRequest).not.toHaveBeenCalled();
  });

  it("appointmentId de outro paciente → 403", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments: vi.fn().mockResolvedValue([{ id: "apt-de-A" }]) }));
    const createPatientRequest = vi.fn();
    vi.doMock("@/lib/repositories/patient-requests", () => ({ createPatientRequest, findSimilarPendingPatientRequest: vi.fn() }));

    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(validAction({ requestType: "appointment_request", appointmentId: "apt-de-B" }), { adminId: "client-A" }))
      .rejects.toMatchObject({ status: 403 });
    expect(createPatientRequest).not.toHaveBeenCalled();
  });

  it("clientTaskId de outro paciente → 403", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/client-tasks", () => ({ getClientTasks: vi.fn().mockResolvedValue([{ id: "task-de-A" }]) }));
    const createPatientRequest = vi.fn();
    vi.doMock("@/lib/repositories/patient-requests", () => ({ createPatientRequest, findSimilarPendingPatientRequest: vi.fn() }));

    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(validAction({ requestType: "task_difficulty", clientTaskId: "task-de-B" }), { adminId: "client-A" }))
      .rejects.toMatchObject({ status: 403 });
    expect(createPatientRequest).not.toHaveBeenCalled();
  });

  it("solicitação duplicada (mesmo tipo/referência/texto, ainda pendente) → 409, nunca cria de novo", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria" }) }));
    const createPatientRequest = vi.fn();
    vi.doMock("@/lib/repositories/patient-requests", () => ({
      createPatientRequest,
      findSimilarPendingPatientRequest: vi.fn().mockResolvedValue({ id: "existing-request" }),
    }));

    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(validAction(), { adminId: "client-A" })).rejects.toMatchObject({ status: 409 });
    expect(createPatientRequest).not.toHaveBeenCalled();
  });
});

// ── rotas /api/portal/ai/proposals/[id] — confirmação, cancelamento, replay, IDOR ──

const sessionA: ClientPortalSession = { sub: "client-A", type: "client_portal", sessionVersion: 1 };
const sessionB: ClientPortalSession = { sub: "client-B", type: "client_portal", sessionVersion: 1 };

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://brunanutri.com.br"), { method: "POST" });
}

class FakeProposalsDb {
  private rows = new Map<string, { id: string; admin_id: string; kind: string; status: string; params_json: string; expires_at: string }>();
  private executions = new Map<string, Record<string, unknown>>();
  seed(row: { id: string; admin_id: string; kind: string; status?: string; params_json: string; expires_at?: string }) {
    this.rows.set(row.id, { id: row.id, admin_id: row.admin_id, kind: row.kind, status: row.status ?? "pending", params_json: row.params_json, expires_at: row.expires_at ?? new Date(Date.now() + 60_000).toISOString() });
  }
  async claim(id: string, ownerId: string) {
    const row = this.rows.get(id);
    if (!row || row.admin_id !== ownerId || row.status !== "pending") return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) return null;
    row.status = "executing";
    return { ...row };
  }
  async cancel(id: string, ownerId: string) {
    const row = this.rows.get(id);
    if (!row || row.admin_id !== ownerId || row.status !== "pending") return false;
    row.status = "cancelled";
    return true;
  }
  async finalize(id: string, status: "completed" | "failed") {
    const row = this.rows.get(id);
    if (row) row.status = status;
  }
  async get(id: string, ownerId: string) {
    const row = this.rows.get(id);
    return row && row.admin_id === ownerId ? { ...row } : null;
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

function mockRepo(db: FakeProposalsDb) {
  vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
    claimAiActionProposal: (id: string, ownerId: string) => db.claim(id, ownerId),
    cancelAiActionProposal: (id: string, ownerId: string) => db.cancel(id, ownerId),
    finalizeAiActionProposal: (id: string, status: "completed" | "failed") => db.finalize(id, status),
    getAiActionProposal: (id: string, ownerId: string) => db.get(id, ownerId),
    markAiActionProposalExpired: vi.fn(),
    isAiActionProposalExpired: () => false,
    getProposalExecution: (id: string) => db.getExecution(id),
    recordProposalExecution: (id: string, kind: string, result: Record<string, unknown>) => db.recordExecution(id, kind, result),
  }));
}

function mockHappyPathDeps() {
  vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria" }) }));
  vi.doMock("@/lib/repositories/patient-requests", () => ({
    createPatientRequest: vi.fn().mockResolvedValue("request-real-1"),
    findSimilarPendingPatientRequest: vi.fn().mockResolvedValue(null),
  }));
}

describe("POST /api/portal/ai/proposals/[id]/confirm — patient_change_request", () => {
  it("confirmação obrigatória: a solicitação só é criada depois do confirm explícito (nunca antes)", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    mockHappyPathDeps();
    const db = new FakeProposalsDb();
    db.seed({ id: "p1", admin_id: "client-A", kind: "patient_change_request", params_json: JSON.stringify(validAction()) });
    mockRepo(db);

    const { POST } = await import("../app/api/portal/ai/proposals/[id]/confirm/route");
    const response = await POST(makeRequest("/api/portal/ai/proposals/p1/confirm"), { params: Promise.resolve({ id: "p1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "completed", kind: "patient_change_request", requestId: "request-real-1" });
    expect(db.statusOf("p1")).toBe("completed");
  });

  it("cancelamento: proposta pendente cancelada nunca é confirmável depois", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    const db = new FakeProposalsDb();
    db.seed({ id: "p1", admin_id: "client-A", kind: "patient_change_request", params_json: JSON.stringify(validAction()) });
    vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
      cancelAiActionProposal: (id: string, ownerId: string) => db.cancel(id, ownerId),
      getAiActionProposal: (id: string, ownerId: string) => db.get(id, ownerId),
    }));

    const { POST: CANCEL } = await import("../app/api/portal/ai/proposals/[id]/cancel/route");
    const cancelResponse = await CANCEL(makeRequest("/api/portal/ai/proposals/p1/cancel"), { params: Promise.resolve({ id: "p1" }) });
    expect(cancelResponse.status).toBe(200);
    expect(db.statusOf("p1")).toBe("cancelled");
  });

  it("replay: confirmar duas vezes não cria dois pedidos (idempotência)", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    mockHappyPathDeps();
    const db = new FakeProposalsDb();
    db.seed({ id: "p1", admin_id: "client-A", kind: "patient_change_request", params_json: JSON.stringify(validAction()) });
    mockRepo(db);

    const { POST } = await import("../app/api/portal/ai/proposals/[id]/confirm/route");
    const first = await POST(makeRequest("/api/portal/ai/proposals/p1/confirm"), { params: Promise.resolve({ id: "p1" }) });
    expect(first.status).toBe(200);

    db.claim = async (id: string, ownerId: string) => {
      const row = await db.get(id, ownerId);
      return row ? { ...row, status: "executing" } : null;
    };
    const second = await POST(makeRequest("/api/portal/ai/proposals/p1/confirm"), { params: Promise.resolve({ id: "p1" }) });
    const secondBody = await second.json();
    expect(second.status).toBe(200);
    expect(secondBody).toEqual({ status: "completed", kind: "patient_change_request", requestId: "request-real-1" });
  });

  it("IDOR: paciente B não confirma proposta de patient_change_request criada por A", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionB) }));
    const db = new FakeProposalsDb();
    db.seed({ id: "p1", admin_id: "client-A", kind: "patient_change_request", params_json: JSON.stringify(validAction()) });
    mockRepo(db);
    const createPatientRequest = vi.fn();
    vi.doMock("@/lib/repositories/patient-requests", () => ({ createPatientRequest, findSimilarPendingPatientRequest: vi.fn() }));

    const { POST } = await import("../app/api/portal/ai/proposals/[id]/confirm/route");
    const response = await POST(makeRequest("/api/portal/ai/proposals/p1/confirm"), { params: Promise.resolve({ id: "p1" }) });
    expect(response.status).toBe(404);
    expect(createPatientRequest).not.toHaveBeenCalled();
    expect(db.statusOf("p1")).toBe("pending");
  });

  it("kind administrativa (nutrition_record) rejeitada mesmo se o owner id coincidisse — nunca executada pelo canal do portal", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    const db = new FakeProposalsDb();
    db.seed({
      id: "p-admin", admin_id: "client-A", kind: "nutrition_record",
      params_json: JSON.stringify({ kind: "nutrition_record", clientId: "client-A", fields: { clinical_history: "sigiloso" }, risk: "clinical", requiresConfirmation: true }),
    });
    mockRepo(db);
    const updateNutritionRecord = vi.fn();
    vi.doMock("@/lib/repositories/nutrition-records", () => ({ updateNutritionRecord }));

    const { POST } = await import("../app/api/portal/ai/proposals/[id]/confirm/route");
    const response = await POST(makeRequest("/api/portal/ai/proposals/p-admin/confirm"), { params: Promise.resolve({ id: "p-admin" }) });
    expect(response.status).toBe(403);
    expect(updateNutritionRecord).not.toHaveBeenCalled();
  });
});

// ── admin: listar, filtrar, marcar status ────────────────────────────────

describe("GET/PATCH /api/admin/patient-requests — inbox da nutricionista", () => {
  it("lista solicitações resolvendo nome do cliente, e filtra por status/clientId via query", async () => {
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue({ sub: "admin-1" }) }));
    const listPatientRequests = vi.fn().mockResolvedValue([
      { id: "r1", client_id: "client-A", request_type: "food_substitution", patient_text: "Banana por maçã", ai_summary: null, meal_plan_id: null, meal_id: null, item_id: null, appointment_id: null, client_task_id: null, status: "pending_review", admin_notes: null, reviewed_at: null, created_at: "2026-08-10T12:00:00.000Z" },
    ]);
    vi.doMock("@/lib/repositories/patient-requests", () => ({ listPatientRequests }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria Silva" }) }));

    const { GET } = await import("../app/api/admin/patient-requests/route");
    const response = await GET(new NextRequest("https://brunanutri.com.br/api/admin/patient-requests?status=pending_review&clientId=client-A"));
    const body = await response.json();

    expect(listPatientRequests).toHaveBeenCalledWith(expect.objectContaining({ status: "pending_review", clientId: "client-A" }));
    expect(body.items[0]).toMatchObject({ id: "r1", clientName: "Maria Silva", status: "pending_review" });
  });

  it("marca como revisado/resolvido/descartado via PATCH, gravando admin_notes", async () => {
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue({ sub: "admin-1" }) }));
    vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "hash" }) }));
    const existing = { id: "r1", client_id: "client-A", request_type: "food_substitution", status: "pending_review" };
    const updatePatientRequestStatus = vi.fn().mockResolvedValue({ id: "r1", status: "resolved", admin_notes: "Combinado na consulta.", reviewed_at: "2026-08-10T12:00:00.000Z" });
    vi.doMock("@/lib/repositories/patient-requests", () => ({
      getPatientRequestById: vi.fn().mockResolvedValue(existing),
      updatePatientRequestStatus,
    }));

    const { PATCH } = await import("../app/api/admin/patient-requests/[id]/route");
    const req = new NextRequest("https://brunanutri.com.br/api/admin/patient-requests/r1", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "resolved", adminNotes: "Combinado na consulta." }),
    });
    const response = await PATCH(req, { params: Promise.resolve({ id: "r1" }) });
    const body = await response.json();

    expect(updatePatientRequestStatus).toHaveBeenCalledWith("r1", { status: "resolved", adminNotes: "Combinado na consulta." });
    expect(body).toEqual({ id: "r1", status: "resolved", adminNotes: "Combinado na consulta.", reviewedAt: "2026-08-10T12:00:00.000Z" });
  });
});

// ── paciente nunca ve admin_notes ────────────────────────────────────────

describe("executeGetMyRequests — nunca inclui admin_notes (secao 26)", () => {
  it("so devolve requestType/patientText/status/createdAt", async () => {
    const listPatientRequests = vi.fn().mockResolvedValue([
      { id: "r1", client_id: "client-A", request_type: "food_substitution", patient_text: "Banana por maçã", ai_summary: null, status: "reviewed", admin_notes: "Nota interna sigilosa", reviewed_at: "x", created_at: "2026-08-10T12:00:00.000Z" },
    ]);
    vi.doMock("@/lib/repositories/patient-requests", () => ({ listPatientRequests }));
    const { executeGetMyRequests } = await import("../lib/ai/agents/patient/patient-request-agent");
    const result = await executeGetMyRequests("client-A");
    expect(result).toEqual({ requests: [{ requestType: "food_substitution", patientText: "Banana por maçã", status: "reviewed", createdAt: "2026-08-10T12:00:00.000Z" }] });
    expect(JSON.stringify(result)).not.toContain("Nota interna sigilosa");
  });
});
