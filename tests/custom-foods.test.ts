import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Alimentos personalizados (FASE 2, secao 9 do pedido) — repositório
 * (CRUD + conversão para MacroReferenceFood) e rotas REST admin.
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
function mockAudit() {
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
  vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "hash" }) }));
}

describe("repository — lib/repositories/custom-foods.ts", () => {
  it("createCustomFood insere e retorna a linha completa", async () => {
    const rows = new Map<string, Record<string, unknown>>();
    const d1Execute = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith("INSERT INTO custom_foods")) {
        const [id, name, brand, source, portion, kcal, protein, carb, fat, fiber, sodium, calcium, iron, potassium, vitaminC, notes, createdAt, updatedAt] = params;
        rows.set(id as string, {
          id, name, brand, source, portion_base_grams: portion, energy_kcal: kcal, protein_g: protein, carbohydrate_g: carb, fat_g: fat,
          fiber_g: fiber, sodium_mg: sodium, calcium_mg: calcium, iron_mg: iron, potassium_mg: potassium, vitamin_c_mg: vitaminC,
          notes, created_at: createdAt, updated_at: updatedAt,
        });
      }
    });
    const d1Query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("WHERE id = ?1 LIMIT 1")) {
        const row = rows.get(params[0] as string);
        return row ? [row] : [];
      }
      return [];
    });
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute }));
    const { createCustomFood } = await import("../lib/repositories/custom-foods");

    const food = await createCustomFood({
      name: "Whey Protein Isolado",
      brand: "Marca X",
      source: "MANUFACTURER",
      energy_kcal: 380,
      protein_g: 80,
      carbohydrate_g: 5,
      fat_g: 3,
      fiber_g: null,
    });

    expect(food.name).toBe("Whey Protein Isolado");
    expect(food.source).toBe("MANUFACTURER");
    expect(food.energy_kcal).toBe(380);
    expect(food.fiber_g).toBeNull();
  });

  it("getCustomFoodById retorna null quando nao existe (nunca inventa um registro)", async () => {
    const d1Query = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute: vi.fn() }));
    const { getCustomFoodById } = await import("../lib/repositories/custom-foods");
    expect(await getCustomFoodById("nao-existe")).toBeNull();
  });

  it("updateCustomFood retorna null quando o alimento nao existe, sem tentar o UPDATE", async () => {
    const d1Query = vi.fn().mockResolvedValue([]);
    const d1Execute = vi.fn();
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute }));
    const { updateCustomFood } = await import("../lib/repositories/custom-foods");

    const result = await updateCustomFood("nao-existe", {
      name: "X", source: "CUSTOM", energy_kcal: 1, protein_g: 1, carbohydrate_g: 1, fat_g: 1,
    });
    expect(result).toBeNull();
    expect(d1Execute).not.toHaveBeenCalled();
  });

  it("deleteCustomFood retorna false quando nao existe, sem tentar o DELETE", async () => {
    const d1Query = vi.fn().mockResolvedValue([]);
    const d1Execute = vi.fn();
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute }));
    const { deleteCustomFood } = await import("../lib/repositories/custom-foods");
    expect(await deleteCustomFood("nao-existe")).toBe(false);
    expect(d1Execute).not.toHaveBeenCalled();
  });

  it("deleteCustomFood retorna true e executa o DELETE quando existe", async () => {
    const existing = { id: "food-1", name: "X", source: "CUSTOM" };
    const d1Query = vi.fn().mockResolvedValue([existing]);
    const d1Execute = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute }));
    const { deleteCustomFood } = await import("../lib/repositories/custom-foods");
    expect(await deleteCustomFood("food-1")).toBe(true);
    expect(d1Execute).toHaveBeenCalledWith("DELETE FROM custom_foods WHERE id = ?1", ["food-1"]);
  });
});

describe("toMacroReferenceFood — mesma moeda do motor nutricional", () => {
  it("mantem valores como estao quando portion_base_grams = 100", async () => {
    const { toMacroReferenceFood } = await import("../lib/repositories/custom-foods");
    const reference = toMacroReferenceFood({
      id: "food-1", name: "Iogurte", brand: null, source: "CUSTOM", portion_base_grams: 100,
      energy_kcal: 60, protein_g: 4, carbohydrate_g: 6, fat_g: 2,
      fiber_g: null, sodium_mg: 40, calcium_mg: null, iron_mg: null, potassium_mg: null, vitamin_c_mg: null,
      notes: null, created_at: "now", updated_at: "now",
    });
    expect(reference.energia_kcal).toBe(60);
    expect(reference.sodio_mg).toBe(40);
    expect(reference.fibra_g).toBeNull();
    expect(reference.fonte).toBe("custom");
  });

  it("normaliza para por-100g quando a porcao base e diferente de 100", async () => {
    const { toMacroReferenceFood } = await import("../lib/repositories/custom-foods");
    // porcao base de 30g com 120 kcal -> 400 kcal/100g
    const reference = toMacroReferenceFood({
      id: "food-2", name: "Barra proteica", brand: "Marca Y", source: "MANUFACTURER", portion_base_grams: 30,
      energy_kcal: 120, protein_g: 9, carbohydrate_g: 12, fat_g: 3,
      fiber_g: 3, sodium_mg: null, calcium_mg: null, iron_mg: null, potassium_mg: null, vitamin_c_mg: null,
      notes: null, created_at: "now", updated_at: "now",
    });
    expect(reference.energia_kcal).toBeCloseTo(400, 5);
    expect(reference.fibra_g).toBeCloseTo(10, 5);
    expect(reference.fonte).toBe("manufacturer");
    expect(reference.descricao).toBe("Barra proteica (Marca Y)");
  });
});

describe("POST /api/admin/custom-foods", () => {
  it("401 sem sessao de admin", async () => {
    mockAuth(false);
    const { POST } = await import("../app/api/admin/custom-foods/route");
    const response = await POST(new NextRequest(new URL("/api/admin/custom-foods", BASE_URL), { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
  });

  it("400 quando faltam os macros obrigatorios", async () => {
    mockAuth();
    const { POST } = await import("../app/api/admin/custom-foods/route");
    const response = await POST(
      new NextRequest(new URL("/api/admin/custom-foods", BASE_URL), {
        method: "POST",
        body: JSON.stringify({ name: "X", source: "CUSTOM" }),
      })
    );
    expect(response.status).toBe(400);
  });

  it("cria o alimento e registra audit log", async () => {
    mockAuth();
    mockAudit();
    const createCustomFood = vi.fn().mockResolvedValue({ id: "food-1", name: "Whey", source: "MANUFACTURER" });
    vi.doMock("@/lib/repositories/custom-foods", () => ({ createCustomFood, listCustomFoods: vi.fn() }));
    const { POST } = await import("../app/api/admin/custom-foods/route");

    const response = await POST(
      new NextRequest(new URL("/api/admin/custom-foods", BASE_URL), {
        method: "POST",
        body: JSON.stringify({ name: "Whey", source: "MANUFACTURER", energy_kcal: 380, protein_g: 80, carbohydrate_g: 5, fat_g: 3 }),
      })
    );
    expect(response.status).toBe(201);
    expect(createCustomFood).toHaveBeenCalled();
  });
});

describe("PUT/DELETE /api/admin/custom-foods/[id]", () => {
  it("PUT 404 quando o alimento nao existe", async () => {
    mockAuth();
    vi.doMock("@/lib/repositories/custom-foods", () => ({ getCustomFoodById: vi.fn().mockResolvedValue(null), updateCustomFood: vi.fn() }));
    const { PUT } = await import("../app/api/admin/custom-foods/[id]/route");
    const response = await PUT(
      new NextRequest(new URL("/api/admin/custom-foods/food-1", BASE_URL), { method: "PUT", body: "{}" }),
      { params: Promise.resolve({ id: "food-1" }) }
    );
    expect(response.status).toBe(404);
  });

  it("DELETE 404 quando o alimento nao existe, nunca chama deleteCustomFood", async () => {
    mockAuth();
    const deleteCustomFood = vi.fn();
    vi.doMock("@/lib/repositories/custom-foods", () => ({ getCustomFoodById: vi.fn().mockResolvedValue(null), deleteCustomFood }));
    const { DELETE } = await import("../app/api/admin/custom-foods/[id]/route");
    const response = await DELETE(
      new NextRequest(new URL("/api/admin/custom-foods/food-1", BASE_URL), { method: "DELETE" }),
      { params: Promise.resolve({ id: "food-1" }) }
    );
    expect(response.status).toBe(404);
    expect(deleteCustomFood).not.toHaveBeenCalled();
  });

  it("DELETE remove e registra audit log quando o alimento existe", async () => {
    mockAuth();
    mockAudit();
    const deleteCustomFood = vi.fn().mockResolvedValue(true);
    vi.doMock("@/lib/repositories/custom-foods", () => ({
      getCustomFoodById: vi.fn().mockResolvedValue({ id: "food-1", name: "Whey" }),
      deleteCustomFood,
    }));
    const { DELETE } = await import("../app/api/admin/custom-foods/[id]/route");
    const response = await DELETE(
      new NextRequest(new URL("/api/admin/custom-foods/food-1", BASE_URL), { method: "DELETE" }),
      { params: Promise.resolve({ id: "food-1" }) }
    );
    expect(response.status).toBe(200);
    expect(deleteCustomFood).toHaveBeenCalledWith("food-1");
  });
});

describe("integração — custom food entra na busca unificada", () => {
  it("um alimento personalizado convertido aparece em searchAllFoods junto com TACO", async () => {
    vi.doUnmock("@/lib/repositories/custom-foods");
    const { toMacroReferenceFood } = await import("../lib/repositories/custom-foods");
    const { searchAllFoods } = await import("../lib/nutrition/food-search");
    const reference = toMacroReferenceFood({
      id: "food-3", name: "Whey Zero Lactose", brand: null, source: "CUSTOM", portion_base_grams: 100,
      energy_kcal: 370, protein_g: 78, carbohydrate_g: 4, fat_g: 2,
      fiber_g: null, sodium_mg: null, calcium_mg: null, iron_mg: null, potassium_mg: null, vitamin_c_mg: null,
      notes: null, created_at: "now", updated_at: "now",
    });
    const results = searchAllFoods("whey zero lactose", { customFoods: [reference] });
    expect(results[0].source).toBe("CUSTOM");
    expect(results[0].food.numero).toBe("food-3");
  });
});
