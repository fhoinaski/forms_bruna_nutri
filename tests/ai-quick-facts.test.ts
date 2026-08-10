import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Rota /api/admin/ai/quick-facts (secao 33 do pedido de UX): perguntas cuja
 * resposta e 100% deterministica nao devem passar pelo gateway de IA — nem
 * tokens, nem latencia de provedor, nem risco de alucinacao. Estes testes
 * verificam a rota E que o gateway de IA nunca e chamado.
 */

const getAdminFromRequest = vi.fn();
const consumeRateLimit = vi.fn();
const writeAuditLog = vi.fn();
const getRequestFingerprint = vi.fn();
const getClientById = vi.fn();
const getClientEvolutions = vi.fn();
const getAppointments = vi.fn();
const getClientTasks = vi.fn();
const gatewayGenerate = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getAdminFromRequest }));
vi.mock("@/lib/security/rate-limit", () => ({ consumeRateLimit }));
vi.mock("@/lib/security/audit", () => ({ writeAuditLog }));
vi.mock("@/lib/security/request", () => ({ getRequestFingerprint }));
vi.mock("@/lib/repositories/clients", () => ({ getClientById }));
vi.mock("@/lib/repositories/client-evolutions", () => ({ getClientEvolutions }));
vi.mock("@/lib/repositories/appointments", () => ({ getAppointments }));
vi.mock("@/lib/repositories/client-tasks", () => ({ getClientTasks }));
// Se a rota alguma vez chamar o gateway de IA para uma quick-fact, o teste
// falha aqui — a garantia de "zero LLM" precisa ser verificavel, nao so
// assumida pela ausencia de import no código-fonte.
vi.mock("@/lib/ai/gateway/ai-gateway", () => ({ generate: gatewayGenerate }));

const admin: SessionPayload = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://brunanutri.com.br/api/admin/ai/quick-facts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/ai/quick-facts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAdminFromRequest.mockResolvedValue(admin);
    consumeRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 });
    writeAuditLog.mockResolvedValue(undefined);
    getRequestFingerprint.mockReturnValue({ ipHash: "hash" });
  });

  it("rejeita sem sessao", async () => {
    getAdminFromRequest.mockResolvedValue(null);
    const { POST } = await import("../app/api/admin/ai/quick-facts/route");
    const response = await POST(makeRequest({ action: "client_evolution", clientId: "c1" }));
    expect(response.status).toBe(401);
  });

  it("rejeita action desconhecida sem chamar nenhum repositorio", async () => {
    const { POST } = await import("../app/api/admin/ai/quick-facts/route");
    const response = await POST(makeRequest({ action: "invent_something", clientId: "c1" }));
    expect(response.status).toBe(400);
    expect(getClientById).not.toHaveBeenCalled();
  });

  it("client_evolution: repassa os fatos calculados deterministicamente, sem chamar o gateway de IA", async () => {
    getClientById.mockResolvedValue({ id: "c1", name: "Maria Silva" });
    getClientEvolutions.mockResolvedValue([
      { weight: 69.8, bmi: 24.6, measured_at: "2026-08-01T00:00:00.000Z" },
      { weight: 72.1, bmi: 25.4, measured_at: "2026-07-01T00:00:00.000Z" },
    ]);
    getAppointments.mockResolvedValue([{ starts_at: "2026-08-01T13:00:00.000Z", title: "Retorno", status: "realizado" }]);

    const { POST } = await import("../app/api/admin/ai/quick-facts/route");
    const response = await POST(makeRequest({ action: "client_evolution", clientId: "c1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.facts).toEqual({
      type: "client_evolution",
      data: expect.objectContaining({ found: true, currentWeightKg: 69.8, previousWeightKg: 72.1, weightVariationKg: -2.3 }),
    });
    expect(gatewayGenerate).not.toHaveBeenCalled();
  });

  it("client_evolution: cliente inexistente retorna found=false, nunca inventa numero", async () => {
    getClientById.mockResolvedValue(null);
    const { POST } = await import("../app/api/admin/ai/quick-facts/route");
    const response = await POST(makeRequest({ action: "client_evolution", clientId: "ghost" }));
    const body = await response.json();
    expect(body.facts).toEqual({ type: "client_evolution", data: { found: false } });
  });

  it("client_pending_tasks: lista tarefas pendentes reais do cliente", async () => {
    getClientById.mockResolvedValue({ id: "c1", name: "Maria Silva" });
    getClientTasks.mockResolvedValue([{ title: "Enviar exames", due_date: "2026-08-15" }]);

    const { POST } = await import("../app/api/admin/ai/quick-facts/route");
    const response = await POST(makeRequest({ action: "client_pending_tasks", clientId: "c1" }));
    const body = await response.json();

    expect(body.facts).toEqual({
      type: "client_pending_tasks",
      data: { found: true, clientName: "Maria Silva", tasks: [{ title: "Enviar exames", dueDate: "2026-08-15" }] },
    });
    expect(getClientTasks).toHaveBeenCalledWith("c1", { status: "pendente" });
  });

  it("client_pending_tasks: cliente inexistente nao retorna lista vazia disfarcada de 'sem pendencias'", async () => {
    getClientById.mockResolvedValue(null);
    const { POST } = await import("../app/api/admin/ai/quick-facts/route");
    const response = await POST(makeRequest({ action: "client_pending_tasks", clientId: "ghost" }));
    const body = await response.json();
    expect(body.facts).toEqual({ type: "client_pending_tasks", data: { found: false, clientName: "", tasks: [] } });
    expect(getClientTasks).not.toHaveBeenCalled();
  });

  it("day_overview: valida formato de data e cruza agenda com pendencias", async () => {
    getAppointments.mockResolvedValue([
      { id: "a1", client_id: "c1", client_name: "Maria Silva", title: "Consulta", starts_at: "2026-08-11T13:00:00.000Z", status: "agendado" },
    ]);
    getClientTasks.mockResolvedValue([]);

    const { POST } = await import("../app/api/admin/ai/quick-facts/route");
    const badDate = await POST(makeRequest({ action: "day_overview", date: "11-08-2026" }));
    expect(badDate.status).toBe(400);

    const response = await POST(makeRequest({ action: "day_overview", date: "2026-08-11" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.facts.type).toBe("patients_with_pendencies");
    expect(body.facts.data.patients).toHaveLength(1);
  });

  it("grava audit log sem texto clinico — so ids e a acao usada", async () => {
    getClientById.mockResolvedValue({ id: "c1", name: "Maria Silva" });
    getClientEvolutions.mockResolvedValue([]);
    getAppointments.mockResolvedValue([]);

    const { POST } = await import("../app/api/admin/ai/quick-facts/route");
    await POST(makeRequest({ action: "client_evolution", clientId: "c1" }));

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai_quick_fact_used",
        adminId: "admin-1",
        metadata: expect.objectContaining({ quickAction: "client_evolution", clientId: "c1" }),
      })
    );
  });
});
