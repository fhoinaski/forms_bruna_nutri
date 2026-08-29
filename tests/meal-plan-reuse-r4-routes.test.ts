import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

const admin: SessionPayload = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };
const other: SessionPayload = { sub: "admin-2", email: "outro@example.com", name: "Outro", mustChangePassword: false, sessionVersion: 1 };
const BASE_URL = "https://brunanutri.com.br";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function mockAuth(payload: SessionPayload | null = admin) {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(payload) }));
}

describe("GET/POST /api/admin/foods/recent", () => {
  it("requires authentication", async () => {
    mockAuth(null);
    const { GET } = await import("../app/api/admin/foods/recent/route");
    const response = await GET(new NextRequest(new URL("/api/admin/foods/recent", BASE_URL)));
    expect(response.status).toBe(401);
  });

  it("lists recent foods scoped to the authenticated admin, hydrated with current catalog data", async () => {
    mockAuth();
    vi.doMock("@/lib/repositories/admin-food-usage", () => ({
      listRecentFoodUsage: vi.fn(async (adminId: string) => {
        expect(adminId).toBe("admin-1");
        return [{ id: "1", admin_id: "admin-1", food_source: "TACO", food_ref_id: "3", use_count: 2, last_used_at: "2026-08-27T00:00:00.000Z", created_at: "2026-08-01T00:00:00.000Z" }];
      }),
      recordFoodUsage: vi.fn(),
    }));
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      getFoodByReference: vi.fn(async () => ({ name: "Arroz, tipo 1, cozido", sourceLabel: "TACO" })),
    }));
    const { GET } = await import("../app/api/admin/foods/recent/route");
    const response = await GET(new NextRequest(new URL("/api/admin/foods/recent", BASE_URL)));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe("Arroz, tipo 1, cozido");
  });

  it("rejects a malformed record body", async () => {
    mockAuth();
    vi.doMock("@/lib/repositories/admin-food-usage", () => ({ recordFoodUsage: vi.fn(), listRecentFoodUsage: vi.fn() }));
    const { POST } = await import("../app/api/admin/foods/recent/route");
    const response = await POST(new NextRequest(new URL("/api/admin/foods/recent", BASE_URL), { method: "POST", body: JSON.stringify({}) }));
    expect(response.status).toBe(400);
  });

  it("records usage for the authenticated admin", async () => {
    mockAuth();
    const recordFoodUsage = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/repositories/admin-food-usage", () => ({ recordFoodUsage, listRecentFoodUsage: vi.fn() }));
    const { POST } = await import("../app/api/admin/foods/recent/route");
    const response = await POST(new NextRequest(new URL("/api/admin/foods/recent", BASE_URL), { method: "POST", body: JSON.stringify({ source: "TACO", refId: "3" }) }));
    expect(response.status).toBe(200);
    expect(recordFoodUsage).toHaveBeenCalledWith({ adminId: "admin-1", foodSource: "TACO", foodRefId: "3" });
  });
});

describe("GET/POST/DELETE /api/admin/foods/favorites", () => {
  it("requires authentication on every verb", async () => {
    mockAuth(null);
    const { GET, POST, DELETE } = await import("../app/api/admin/foods/favorites/route");
    expect((await GET(new NextRequest(new URL("/api/admin/foods/favorites", BASE_URL)))).status).toBe(401);
    expect((await POST(new NextRequest(new URL("/api/admin/foods/favorites", BASE_URL), { method: "POST", body: "{}" }))).status).toBe(401);
    expect((await DELETE(new NextRequest(new URL("/api/admin/foods/favorites?source=TACO&refId=3", BASE_URL), { method: "DELETE" }))).status).toBe(401);
  });

  it("adds and removes a favorite for the authenticated admin only", async () => {
    mockAuth();
    const addFoodFavorite = vi.fn().mockResolvedValue(undefined);
    const removeFoodFavorite = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/repositories/admin-food-favorites", () => ({ addFoodFavorite, removeFoodFavorite, listFoodFavorites: vi.fn().mockResolvedValue([]) }));
    const { POST, DELETE } = await import("../app/api/admin/foods/favorites/route");

    await POST(new NextRequest(new URL("/api/admin/foods/favorites", BASE_URL), { method: "POST", body: JSON.stringify({ source: "TACO", refId: "3" }) }));
    expect(addFoodFavorite).toHaveBeenCalledWith({ adminId: "admin-1", foodSource: "TACO", foodRefId: "3" });

    await DELETE(new NextRequest(new URL("/api/admin/foods/favorites?source=TACO&refId=3", BASE_URL), { method: "DELETE" }));
    expect(removeFoodFavorite).toHaveBeenCalledWith({ adminId: "admin-1", foodSource: "TACO", foodRefId: "3" });
  });
});

describe("saved meals — /api/admin/saved-meals", () => {
  it("requires authentication", async () => {
    mockAuth(null);
    const { GET, POST } = await import("../app/api/admin/saved-meals/route");
    expect((await GET(new NextRequest(new URL("/api/admin/saved-meals", BASE_URL)))).status).toBe(401);
    expect((await POST(new NextRequest(new URL("/api/admin/saved-meals", BASE_URL), { method: "POST", body: "{}" }))).status).toBe(401);
  });

  it("creates a saved meal scoped to the authenticated admin", async () => {
    mockAuth();
    const saveMealForReuse = vi.fn().mockResolvedValue({ id: "saved-1", admin_id: "admin-1", name: "Café", meal_structure: "SIMPLE", meal: { name: "Café", items: [] }, usage_count: 0, created_at: "now", updated_at: "now" });
    vi.doMock("@/lib/repositories/admin-saved-meals", () => ({ saveMealForReuse, listSavedMeals: vi.fn() }));
    const { POST } = await import("../app/api/admin/saved-meals/route");
    const response = await POST(new NextRequest(new URL("/api/admin/saved-meals", BASE_URL), {
      method: "POST",
      body: JSON.stringify({ name: "Café", meal: { name: "Café", items: [{ food: "Pão", quantity: "50", unit: "g" }] } }),
    }));
    expect(response.status).toBe(201);
    expect(saveMealForReuse).toHaveBeenCalledWith(expect.objectContaining({ adminId: "admin-1", name: "Café" }));
  });

  it("rejects an invalid meal payload", async () => {
    mockAuth();
    vi.doMock("@/lib/repositories/admin-saved-meals", () => ({ saveMealForReuse: vi.fn(), listSavedMeals: vi.fn() }));
    const { POST } = await import("../app/api/admin/saved-meals/route");
    const response = await POST(new NextRequest(new URL("/api/admin/saved-meals", BASE_URL), { method: "POST", body: JSON.stringify({ name: "" }) }));
    expect(response.status).toBe(400);
  });

  it("[id] route: never returns a saved meal owned by a different admin (IDOR)", async () => {
    mockAuth(admin);
    const getSavedMeal = vi.fn(async (adminId: string, id: string) => {
      // Repositorio real sempre filtra por admin_id no WHERE — aqui simulamos
      // esse comportamento: só devolve algo se o admin bate.
      if (adminId !== "admin-1") return null;
      return { id, admin_id: "admin-1", name: "Café", meal_structure: "SIMPLE", meal: { name: "Café", items: [] }, usage_count: 0, created_at: "now", updated_at: "now" };
    });
    vi.doMock("@/lib/repositories/admin-saved-meals", () => ({ getSavedMeal, deleteSavedMeal: vi.fn(), incrementSavedMealUsage: vi.fn() }));
    const { GET } = await import("../app/api/admin/saved-meals/[id]/route");

    const okResponse = await GET(new NextRequest(new URL("/api/admin/saved-meals/saved-1", BASE_URL)), { params: Promise.resolve({ id: "saved-1" }) });
    expect(okResponse.status).toBe(200);

    mockAuth(other);
    vi.resetModules();
    mockAuth(other);
    vi.doMock("@/lib/repositories/admin-saved-meals", () => ({ getSavedMeal, deleteSavedMeal: vi.fn(), incrementSavedMealUsage: vi.fn() }));
    const { GET: GET2 } = await import("../app/api/admin/saved-meals/[id]/route");
    const idorResponse = await GET2(new NextRequest(new URL("/api/admin/saved-meals/saved-1", BASE_URL)), { params: Promise.resolve({ id: "saved-1" }) });
    expect(idorResponse.status).toBe(404);
  });
});

describe("GET /api/admin/protocol-templates/[id]/meals", () => {
  it("requires authentication", async () => {
    mockAuth(null);
    const { GET } = await import("../app/api/admin/protocol-templates/[id]/meals/route");
    const response = await GET(new NextRequest(new URL("/api/admin/protocol-templates/t1/meals", BASE_URL)), { params: Promise.resolve({ id: "t1" }) });
    expect(response.status).toBe(401);
  });

  it("404s for a non-existent template", async () => {
    mockAuth();
    vi.doMock("@/lib/repositories/protocol-templates", () => ({ getTemplateById: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getTemplateFlatMeals: vi.fn() }));
    const { GET } = await import("../app/api/admin/protocol-templates/[id]/meals/route");
    const response = await GET(new NextRequest(new URL("/api/admin/protocol-templates/ghost/meals", BASE_URL)), { params: Promise.resolve({ id: "ghost" }) });
    expect(response.status).toBe(404);
  });

  it("returns the flat prescribed meals for an existing template", async () => {
    mockAuth();
    vi.doMock("@/lib/repositories/protocol-templates", () => ({ getTemplateById: vi.fn().mockResolvedValue({ id: "t1", title: "Adulto saudável", target_group: "ADULTO_SAUDAVEL", type: "DIETA" }) }));
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getTemplateFlatMeals: vi.fn().mockResolvedValue([{ name: "Almoço", items: [{ food: "Arroz", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "3" }] }]) }));
    const { GET } = await import("../app/api/admin/protocol-templates/[id]/meals/route");
    const response = await GET(new NextRequest(new URL("/api/admin/protocol-templates/t1/meals", BASE_URL)), { params: Promise.resolve({ id: "t1" }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.meals).toHaveLength(1);
    expect(body.meals[0].items[0].food_ref_id).toBe("3");
  });
});
