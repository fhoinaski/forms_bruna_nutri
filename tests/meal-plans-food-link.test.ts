import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * FASE 2 — vinculo estruturado do item (food_source/food_ref_id) e metas do
 * plano (target_*) persistidos pelo repositório de meal-plans, e busca
 * unificada (TACO + alimentos personalizados) no endpoint de busca.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const admin: SessionPayload = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };
const BASE_URL = "https://brunanutri.com.br";

describe("lib/repositories/meal-plans.ts — vinculo estruturado e metas", () => {
  it("persiste food_source/food_ref_id no INSERT de itens ao criar um plano", async () => {
    const batchCalls: unknown[][] = [];
    const d1Batch = vi.fn(async (statements: { sql: string; params?: unknown[] }[]) => {
      batchCalls.push(statements as unknown[]);
      return statements.map(() => ({ results: [], success: true }));
    });
    const d1Query = vi.fn().mockResolvedValue([{
      id: "plan-1", client_id: "client-1", title: "Plano", target_group: null, status: "draft", version: 1,
      notes: null, target_energy_kcal: null, target_protein_g: null, target_carbohydrate_g: null, target_fat_g: null,
      created_at: "now", updated_at: "now",
    }]);
    vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query, d1Execute: vi.fn() }));
    vi.doMock("@/lib/repositories/protocol-templates", () => ({ getAllTemplates: vi.fn() }));
    vi.doMock("@/lib/security/encrypted-fields", () => ({ encryptJsonValue: (v: unknown) => `encj:${JSON.stringify(v)}` }));
    const { createMealPlan } = await import("../lib/repositories/meal-plans");

    await createMealPlan({
      clientId: "client-1",
      title: "Plano",
      meals: [{ name: "Café", items: [{ food: "Arroz", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "3" }] }],
      substitutions: [],
      supplements: [],
    });

    const itemInsert = batchCalls.flat().find((statement) => {
      const s = statement as { sql: string };
      return s.sql.includes("INSERT INTO meal_plan_items");
    }) as { sql: string; params: unknown[] } | undefined;
    expect(itemInsert).toBeDefined();
    const itemRowsJson = itemInsert!.params[0] as string;
    expect(itemRowsJson).toContain('"foodSource":"TACO"');
    expect(itemRowsJson).toContain('"foodRefId":"3"');
  });

  it("persiste as metas nutricionais (target_*) ao atualizar um plano", async () => {
    const executedSql: { sql: string; params?: unknown[] }[] = [];
    const d1Batch = vi.fn(async (statements: { sql: string; params?: unknown[] }[]) => {
      executedSql.push(...statements);
      return statements.map(() => ({ results: [], success: true }));
    });
    const d1Query = vi.fn().mockResolvedValue([{
      id: "plan-1", client_id: "client-1", title: "Plano", target_group: null, status: "draft", version: 1,
      notes: null, target_energy_kcal: null, target_protein_g: null, target_carbohydrate_g: null, target_fat_g: null,
      created_at: "now", updated_at: "now",
    }]);
    vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query, d1Execute: vi.fn() }));
    vi.doMock("@/lib/repositories/protocol-templates", () => ({ getAllTemplates: vi.fn() }));
    vi.doMock("@/lib/security/encrypted-fields", () => ({ encryptJsonValue: (v: unknown) => `encj:${JSON.stringify(v)}` }));
    const { updateMealPlan } = await import("../lib/repositories/meal-plans");

    await updateMealPlan("plan-1", "client-1", {
      title: "Plano",
      status: "draft",
      target_energy_kcal: 1900,
      target_protein_g: 130,
      target_carbohydrate_g: 210,
      target_fat_g: 60,
      meals: [],
      substitutions: [],
      supplements: [],
    });

    const updateStatement = executedSql.find((statement) => statement.sql.includes("target_energy_kcal = ?4"));
    expect(updateStatement).toBeDefined();
    expect(updateStatement!.params).toEqual(
      expect.arrayContaining([1900, 130, 210, 60])
    );
  });

  it("planos legados sem meta (target_* undefined) gravam null, nunca inventam um valor", async () => {
    const executedSql: { sql: string; params?: unknown[] }[] = [];
    const d1Batch = vi.fn(async (statements: { sql: string; params?: unknown[] }[]) => {
      executedSql.push(...statements);
      return statements.map(() => ({ results: [], success: true }));
    });
    const d1Query = vi.fn().mockResolvedValue([{ id: "plan-1", client_id: "client-1" }]);
    vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query, d1Execute: vi.fn() }));
    vi.doMock("@/lib/repositories/protocol-templates", () => ({ getAllTemplates: vi.fn() }));
    vi.doMock("@/lib/security/encrypted-fields", () => ({ encryptJsonValue: (v: unknown) => `encj:${JSON.stringify(v)}` }));
    const { updateMealPlan } = await import("../lib/repositories/meal-plans");

    await updateMealPlan("plan-1", "client-1", { title: "Plano", status: "draft", meals: [], substitutions: [], supplements: [] });

    const updateStatement = executedSql.find((statement) => statement.sql.includes("target_energy_kcal = ?4"));
    expect(updateStatement?.params?.slice(3, 7)).toEqual([null, null, null, null]);
  });
});

describe("GET /api/admin/foods/search — busca unificada", () => {
  it("401 sem sessao de admin", async () => {
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(null) }));
    const { GET } = await import("../app/api/admin/foods/search/route");
    const response = await GET(new NextRequest(new URL("/api/admin/foods/search?q=banana", BASE_URL)));
    expect(response.status).toBe(401);
  });

  it("inclui alimentos personalizados nos resultados, junto com TACO", async () => {
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(admin) }));
    vi.doMock("@/lib/repositories/custom-foods", () => ({
      listCustomFoods: vi.fn().mockResolvedValue([{
        id: "food-1", name: "Whey Isolado", brand: null, source: "CUSTOM", portion_base_grams: 100,
        energy_kcal: 380, protein_g: 80, carbohydrate_g: 5, fat_g: 3,
        fiber_g: null, sodium_mg: null, calcium_mg: null, iron_mg: null, potassium_mg: null, vitamin_c_mg: null,
        notes: null, created_at: "now", updated_at: "now",
      }]),
      toMacroReferenceFood: (row: { id: string; name: string; energy_kcal: number; protein_g: number; carbohydrate_g: number; fat_g: number }) => ({
        numero: row.id, descricao: row.name, fonte: "custom", energia_kcal: row.energy_kcal, proteina_g: row.protein_g, carboidrato_g: row.carbohydrate_g, lipidios_g: row.fat_g,
      }),
    }));
    const { GET } = await import("../app/api/admin/foods/search/route");
    const response = await GET(new NextRequest(new URL("/api/admin/foods/search?q=whey isolado", BASE_URL)));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items.some((item: { numero: string }) => item.numero === "food-1")).toBe(true);
  });
});
