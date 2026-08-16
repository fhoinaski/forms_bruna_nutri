import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * GET /api/admin/foods/search — cobre autenticacao e o contrato de
 * performance: listCustomFoods() deve ser chamado com a query digitada
 * (filtro SQL), nunca sem argumento (o que traria a tabela custom_foods
 * inteira a cada tecla — bug encontrado na auditoria do MealPlanEditor).
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const admin: SessionPayload = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };
const BASE_URL = "https://brunanutri.com.br";

function mockAuth(authed = true) {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(authed ? admin : null) }));
}

function mockUsda() {
  vi.doMock("@/lib/repositories/usda-foods", () => ({
    searchUsdaFoods: vi.fn().mockResolvedValue([]),
    getUsdaFoodBySourceId: vi.fn(),
    toUsdaMacroReference: vi.fn(),
  }));
}

describe("GET /api/admin/foods/search", () => {
  it("401 sem sessao de admin", async () => {
    mockAuth(false);
    vi.doMock("@/lib/repositories/custom-foods", () => ({
      listCustomFoods: vi.fn(),
      toMacroReferenceFood: vi.fn(),
    }));
    mockUsda();
    const { GET } = await import("../app/api/admin/foods/search/route");
    const response = await GET(new NextRequest(new URL("/api/admin/foods/search?q=arroz", BASE_URL)));
    expect(response.status).toBe(401);
  });

  it("chama listCustomFoods com a query digitada, nao sem argumento", async () => {
    mockAuth();
    const listCustomFoods = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/repositories/custom-foods", () => ({
      listCustomFoods,
      toMacroReferenceFood: vi.fn((food) => food),
    }));
    mockUsda();
    const { GET } = await import("../app/api/admin/foods/search/route");
    await GET(new NextRequest(new URL("/api/admin/foods/search?q=arroz", BASE_URL)));
    expect(listCustomFoods).toHaveBeenCalledWith("arroz");
    expect(listCustomFoods).not.toHaveBeenCalledWith();
  });

  it("nao consulta o banco quando a query tem menos de 2 caracteres uteis", async () => {
    mockAuth();
    const listCustomFoods = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/repositories/custom-foods", () => ({
      listCustomFoods,
      toMacroReferenceFood: vi.fn((food) => food),
    }));
    mockUsda();
    const { GET } = await import("../app/api/admin/foods/search/route");
    const response = await GET(new NextRequest(new URL("/api/admin/foods/search?q=a", BASE_URL)));
    const body = await response.json();
    expect(body).toEqual({ items: [] });
    expect(listCustomFoods).not.toHaveBeenCalled();
  });

  it("nao consulta o banco quando a query esta ausente", async () => {
    mockAuth();
    const listCustomFoods = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/repositories/custom-foods", () => ({
      listCustomFoods,
      toMacroReferenceFood: vi.fn((food) => food),
    }));
    mockUsda();
    const { GET } = await import("../app/api/admin/foods/search/route");
    const response = await GET(new NextRequest(new URL("/api/admin/foods/search", BASE_URL)));
    const body = await response.json();
    expect(body).toEqual({ items: [] });
    expect(listCustomFoods).not.toHaveBeenCalled();
  });
});
