import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientPortalSession } from "@/lib/auth/client-portal-session";

/**
 * /api/portal/ai/quick-facts — secao 9/28/39/48 do pedido: "meu plano",
 * "proxima consulta" e "minhas tarefas" sao 100% deterministicos e
 * continuam funcionando mesmo com o provedor de IA fora do ar (nunca
 * chamam o gateway). clientId sempre da sessao.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const sessionA: ClientPortalSession = { sub: "client-A", type: "client_portal", sessionVersion: 1 };

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://brunanutri.com.br/api/portal/ai/quick-facts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/portal/ai/quick-facts", () => {
  it("sem sessao → 401", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(null) }));
    const { POST } = await import("../app/api/portal/ai/quick-facts/route");
    const response = await POST(makeRequest({ action: "meal_plan" }));
    expect(response.status).toBe(401);
  });

  it("continua funcionando com o provedor de IA totalmente indisponível — nunca chama o gateway (secao 39/48)", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    vi.doMock("@/lib/security/rate-limit", () => ({ consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }) }));
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue({ title: "Plano X", meals: [] }) }));
    const generate = vi.fn().mockRejectedValue(new Error("provider indisponivel"));
    vi.doMock("@/lib/ai/gateway/ai-gateway", () => ({ generate }));

    const { POST } = await import("../app/api/portal/ai/quick-facts/route");
    const response = await POST(makeRequest({ action: "meal_plan" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.facts).toEqual({ type: "meal_plan", data: { found: true, mealPlanTitle: "Plano X", meals: [] } });
    expect(generate).not.toHaveBeenCalled();
  });

  it("appointments e tasks tambem usam session.sub — nunca um clientId vindo do body", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    vi.doMock("@/lib/security/rate-limit", () => ({ consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }) }));
    const getAppointments = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments }));
    const getClientTasks = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/repositories/client-tasks", () => ({ getClientTasks }));

    const { POST } = await import("../app/api/portal/ai/quick-facts/route");
    await POST(makeRequest({ action: "appointments", clientId: "client-B-TENTATIVA" }));
    expect(getAppointments).toHaveBeenCalledWith({ clientId: "client-A" });

    await POST(makeRequest({ action: "tasks", clientId: "client-B-TENTATIVA" }));
    expect(getClientTasks).toHaveBeenCalledWith("client-A", { status: "pendente" });
  });

  it("action invalida → 400", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    vi.doMock("@/lib/security/rate-limit", () => ({ consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }) }));
    const { POST } = await import("../app/api/portal/ai/quick-facts/route");
    const response = await POST(makeRequest({ action: "financeiro_admin" }));
    expect(response.status).toBe(400);
  });
});
