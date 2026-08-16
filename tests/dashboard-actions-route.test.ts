import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const BASE_URL = "https://brunanutri.com.br";

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, BASE_URL));
}

describe("GET /api/admin/dashboard/actions", () => {
  it("retorna 401 sem sessão admin", async () => {
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/dashboard/action-items", () => ({ getDashboardActionItems: vi.fn() }));

    const { GET } = await import("../app/api/admin/dashboard/actions/route");
    const response = await GET(request("/api/admin/dashboard/actions"));

    expect(response.status).toBe(401);
  });

  it("retorna itens calculados e timestamp de geração", async () => {
    const getDashboardActionItems = vi.fn().mockResolvedValue([
      {
        id: "appointment-soon:appt-1",
        type: "APPOINTMENT_SOON",
        priority: "HIGH",
        section: "NOW",
        title: "Consulta em 15 min",
        subject: "Ana",
        description: "Retorno (online).",
        source: "appointments",
        sourceId: "appt-1",
        href: "/dashboard/clients/client-1",
        actionLabel: "Abrir paciente",
        dueAt: "2026-08-16T12:15:00.000Z",
        occurredAt: null,
        createdAt: null,
      },
    ]);
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue({ sub: "admin-1" }) }));
    vi.doMock("@/lib/dashboard/action-items", () => ({ getDashboardActionItems }));

    const { GET } = await import("../app/api/admin/dashboard/actions/route");
    const response = await GET(request("/api/admin/dashboard/actions"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(new Date(body.generatedAt).getTime()).toBeGreaterThan(0);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("appointment-soon:appt-1");
    expect(getDashboardActionItems).toHaveBeenCalledWith(expect.any(Date));
  });
});
