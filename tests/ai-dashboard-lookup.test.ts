import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * FASE 1B — tools de leitura do dashboard (lib/ai/agents/dashboard/dashboard-agent.ts).
 * Wrapper fino sobre lib/dashboard/action-items.ts#getDashboardActionItems —
 * nunca um score/criterio de priorizacao novo, so filtra o resultado pronto.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function items() {
  return [
    { id: "a1", type: "APPOINTMENT_NOW", priority: "URGENT", section: "NOW", title: "Consulta em andamento", subject: "Maria", description: "x", source: "appointments", sourceId: "apt-1", href: "/dashboard/clients/client-1", actionLabel: "Abrir paciente", dueAt: "now", occurredAt: null, createdAt: null },
    { id: "b1", type: "PATIENT_REQUEST_PENDING", priority: "HIGH", section: "ATTENTION", title: "Solicitacao", subject: "Joana", description: "y", source: "patient_requests", sourceId: "req-1", href: "/dashboard/solicitacoes", actionLabel: "Ver", dueAt: "now", occurredAt: null, createdAt: "now" },
    { id: "c1", type: "SAFE_SUBSTITUTION_OCCURRED", priority: "INFO", section: "RECENT", title: "Substituicao segura", subject: "Ana", description: "z", source: "patient_food_substitution_events", sourceId: "sub-1", href: "/dashboard/clients/client-2", actionLabel: "Ver", dueAt: null, occurredAt: "now", createdAt: "now" },
  ];
}

describe("executeGetDashboardActionItems", () => {
  it("devolve o feed completo, ja priorizado pelo motor real", async () => {
    vi.doMock("@/lib/dashboard/action-items", () => ({ getDashboardActionItems: vi.fn().mockResolvedValue(items()) }));
    const { executeGetDashboardActionItems } = await import("../lib/ai/agents/dashboard/dashboard-agent");
    const result = await executeGetDashboardActionItems();
    expect(result.totalFound).toBe(3);
    expect(result.items.map((i) => i.id)).toEqual(["a1", "b1", "c1"]);
  });

  it("feed vazio devolve lista vazia, nunca inventa pendencia", async () => {
    vi.doMock("@/lib/dashboard/action-items", () => ({ getDashboardActionItems: vi.fn().mockResolvedValue([]) }));
    const { executeGetDashboardActionItems } = await import("../lib/ai/agents/dashboard/dashboard-agent");
    const result = await executeGetDashboardActionItems();
    expect(result).toEqual({ items: [], totalFound: 0 });
  });
});

describe("executeGetUrgentItems", () => {
  it("filtra so URGENT/HIGH — nunca reclassifica prioridade", async () => {
    vi.doMock("@/lib/dashboard/action-items", () => ({ getDashboardActionItems: vi.fn().mockResolvedValue(items()) }));
    const { executeGetUrgentItems } = await import("../lib/ai/agents/dashboard/dashboard-agent");
    const result = await executeGetUrgentItems();
    expect(result.items.map((i) => i.id)).toEqual(["a1", "b1"]);
  });
});

describe("executeGetRecentActivity", () => {
  it("filtra so a secao RECENT", async () => {
    vi.doMock("@/lib/dashboard/action-items", () => ({ getDashboardActionItems: vi.fn().mockResolvedValue(items()) }));
    const { executeGetRecentActivity } = await import("../lib/ai/agents/dashboard/dashboard-agent");
    const result = await executeGetRecentActivity();
    expect(result.items.map((i) => i.id)).toEqual(["c1"]);
  });
});
