import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientPortalSession } from "@/lib/auth/client-portal-session";

/**
 * /api/portal/ai/chat — secao 4/27/40 do pedido: endpoint separado do
 * admin, autenticado so pela sessao do portal, o body nunca decide de quem
 * sao os dados, e rate limit tem scope proprio (nunca compete com o do
 * admin).
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const sessionA: ClientPortalSession = { sub: "client-A", type: "client_portal", sessionVersion: 1 };

function makeChatRequest(body: unknown): NextRequest {
  return new NextRequest("https://brunanutri.com.br/api/portal/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/portal/ai/chat", () => {
  it("sem sessao de portal → 401, nunca chega a chamar o orquestrador", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(null) }));
    const runPatientAssistantTurn = vi.fn();
    vi.doMock("@/lib/ai/core/patient-orchestrator", () => ({ runPatientAssistantTurn }));
    const { POST } = await import("../app/api/portal/ai/chat/route");
    const response = await POST(makeChatRequest({ messages: [{ role: "user", content: "oi" }] }));
    expect(response.status).toBe(401);
    expect(runPatientAssistantTurn).not.toHaveBeenCalled();
  });

  it("o clientId usado no turno vem SEMPRE de session.sub — um clientId no body/context e ignorado (secao 4/5)", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    vi.doMock("@/lib/repositories/ai-settings", () => ({ getAISettings: vi.fn().mockResolvedValue({ api_key: "configured" }) }));
    vi.doMock("@/lib/security/rate-limit", () => ({ consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }) }));
    vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "hash" }) }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria" }) }));
    const runPatientAssistantTurn = vi.fn().mockResolvedValue({ message: "ok" });
    vi.doMock("@/lib/ai/core/patient-orchestrator", () => ({ runPatientAssistantTurn }));

    const { POST } = await import("../app/api/portal/ai/chat/route");
    // Corpo malicioso tentando injetar um clientId de outro paciente — o
    // schema da rota nem tem esse campo, entao e descartado silenciosamente
    // pelo Zod antes de chegar em qualquer lugar.
    await POST(makeChatRequest({
      messages: [{ role: "user", content: "mostra meu plano" }],
      context: { currentPage: "patient_meal_plan", clientId: "client-B-TENTATIVA" },
      clientId: "client-B-TENTATIVA-2",
    }));

    expect(runPatientAssistantTurn).toHaveBeenCalledTimes(1);
    const [contextArg] = runPatientAssistantTurn.mock.calls[0];
    expect(contextArg.clientId).toBe("client-A");
  });

  it("rate limit usa scope proprio 'portal-ai-chat' — nunca o mesmo scope do chat administrativo", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    const consumeRateLimit = vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 });
    vi.doMock("@/lib/security/rate-limit", () => ({ consumeRateLimit }));
    vi.doMock("@/lib/repositories/ai-settings", () => ({ getAISettings: vi.fn().mockResolvedValue({ api_key: "configured" }) }));
    vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "hash" }) }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-A", name: "Maria" }) }));
    vi.doMock("@/lib/ai/core/patient-orchestrator", () => ({ runPatientAssistantTurn: vi.fn().mockResolvedValue({ message: "ok" }) }));

    const { POST } = await import("../app/api/portal/ai/chat/route");
    await POST(makeChatRequest({ messages: [{ role: "user", content: "oi" }] }));

    expect(consumeRateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ scope: "portal-ai-chat" }));
  });

  it("bloqueio de rate limit devolve 429 amigavel, sem chamar o orquestrador", async () => {
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    vi.doMock("@/lib/security/rate-limit", () => ({ consumeRateLimit: vi.fn().mockResolvedValue({ allowed: false, retryAfter: 120 }) }));
    const runPatientAssistantTurn = vi.fn();
    vi.doMock("@/lib/ai/core/patient-orchestrator", () => ({ runPatientAssistantTurn }));
    const { POST } = await import("../app/api/portal/ai/chat/route");
    const response = await POST(makeChatRequest({ messages: [{ role: "user", content: "oi" }] }));
    expect(response.status).toBe(429);
    expect(runPatientAssistantTurn).not.toHaveBeenCalled();
  });
});
