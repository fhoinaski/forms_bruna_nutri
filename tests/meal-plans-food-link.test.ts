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

  it("persiste snapshot de gramas resolvidos para medida caseira vinculada", async () => {
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
    vi.doMock("@/lib/repositories/food-portions", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/food-portions")>("../lib/repositories/food-portions");
      return {
        ...actual,
        getFoodPortionById: vi.fn().mockResolvedValue({
          id: "m-banana-media",
          food_source: "TACO",
          food_ref_id: "179",
          description: "1 unidade média",
          gram_equivalent: 86,
          source: "TBCA",
          source_version: "v1",
          confidence: "high",
          is_active: 1,
          created_at: "now",
        }),
      };
    });
    const { createMealPlan } = await import("../lib/repositories/meal-plans");

    await createMealPlan({
      clientId: "client-1",
      title: "Plano",
      meals: [{ name: "Café", items: [{ food: "Banana", quantity: "2", unit: null, food_source: "TACO", food_ref_id: "179", household_measure_id: "m-banana-media" }] }],
      substitutions: [],
      supplements: [],
    });

    const itemInsert = batchCalls.flat().find((statement) => {
      const s = statement as { sql: string };
      return s.sql.includes("INSERT INTO meal_plan_items");
    }) as { sql: string; params: unknown[] } | undefined;
    expect(itemInsert?.sql).toContain("resolved_grams_snapshot");
    const itemRows = JSON.parse(itemInsert!.params[0] as string) as Array<Record<string, unknown>>;
    expect(itemRows[0]).toMatchObject({ resolvedGramsSnapshot: 172 });
    expect(String(itemRows[0].quantityResolutionSnapshot)).toContain('"measureId":"m-banana-media"');

    const versionInsert = batchCalls.flat().find((statement) => {
      const s = statement as { sql: string };
      return s.sql.includes("INSERT OR IGNORE INTO meal_plan_versions");
    }) as { params: unknown[] } | undefined;
    const snapshot = JSON.parse(String(versionInsert!.params[4]).replace(/^encj:/, "")) as { meals: Array<{ items: Array<Record<string, unknown>> }> };
    expect(snapshot.meals[0].items[0]).toMatchObject({ resolved_grams_snapshot: 172 });
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
    vi.doMock("@/lib/repositories/usda-foods", () => ({
      searchUsdaFoods: vi.fn().mockResolvedValue([]),
      getUsdaFoodBySourceId: vi.fn(),
      toUsdaMacroReference: vi.fn(),
    }));
    const { GET } = await import("../app/api/admin/foods/search/route");
    const response = await GET(new NextRequest(new URL("/api/admin/foods/search?q=whey isolado", BASE_URL)));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items.some((item: { numero: string }) => item.numero === "food-1")).toBe(true);
    expect(body.items[0]).toHaveProperty("ref");
    expect(body.items.some((item: { ref?: { source: string; sourceId: string } }) => item.ref?.source === "CUSTOM" && item.ref.sourceId === "food-1")).toBe(true);
  });
});

describe("createMealPlanFromTemplates — substituicoes de templates", () => {
  async function createPlanFromTemplatesWithSubstitutions(substitutions: Array<{
    template_id: string;
    base_food: string;
    option_food: string;
    quantity?: string | null;
    unit?: string | null;
    notes?: string | null;
  }>, templateIds = ["tpl-dieta", "tpl-substituicao"]) {
    const batchCalls: Array<Array<{ sql: string; params?: unknown[] }>> = [];
    const d1Batch = vi.fn(async (statements: Array<{ sql: string; params?: unknown[] }>) => {
      batchCalls.push(statements);

      if (statements[0]?.sql.includes("FROM diet_template_meals")) {
        return [
          {
            results: templateIds.includes("tpl-dieta")
              ? [{ id: "meal-template-1", template_id: "tpl-dieta", name: "Almoço", suggested_time: null, notes: null, source_recipe_id: null, sort_order: 0 }]
              : [],
            success: true,
          },
          {
            results: templateIds.includes("tpl-dieta")
              ? [{ id: "item-template-1", meal_id: "meal-template-1", food: "Arroz", quantity: "100", unit: "g", notes: null, sort_order: 0 }]
              : [],
            success: true,
          },
          { results: substitutions.map((item, index) => ({ id: `sub-${index}`, sort_order: index, created_at: "now", updated_at: "now", ...item })), success: true },
          { results: [], success: true },
        ];
      }

      if (statements[0]?.sql.includes("FROM meal_plan_meals")) {
        return [
          { results: [], success: true },
          { results: [], success: true },
          { results: [], success: true },
          { results: [], success: true },
          { results: [], success: true },
        ];
      }

      return statements.map(() => ({ results: [], success: true }));
    });
    const d1Query = vi.fn(async (_sql: string, params?: unknown[]) => [{
      id: String(params?.[0] ?? "plan-1"),
      client_id: "client-1",
      title: "Plano",
      target_group: "GESTANTE",
      status: "draft",
      version: 1,
      notes: null,
      target_energy_kcal: null,
      target_protein_g: null,
      target_carbohydrate_g: null,
      target_fat_g: null,
      created_at: "now",
      updated_at: "now",
    }]);

    vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query, d1Execute: vi.fn() }));
    vi.doMock("@/lib/repositories/protocol-templates", () => ({
      getAllTemplates: vi.fn().mockResolvedValue(templateIds.map((id) => ({
        id,
        type: id === "tpl-substituicao" ? "SUBSTITUICAO" : "DIETA",
        target_group: "GESTANTE",
        title: id,
        content: "{}",
        notes: null,
        is_active: 1,
        created_at: "now",
        updated_at: "now",
        clinical_risk_level: "low",
        requires_professional_review: 0,
        version: 1,
        structure_version: "legacy",
      }))),
      getSlotClassificationBySourceItemId: vi.fn().mockResolvedValue(new Map()),
    }));
    vi.doMock("@/lib/security/encrypted-fields", () => ({ encryptJsonValue: (v: unknown) => `encj:${JSON.stringify(v)}` }));

    const { createMealPlanFromTemplates } = await import("../lib/repositories/meal-plans");
    await createMealPlanFromTemplates({ clientId: "client-1", targetGroup: "GESTANTE" });

    const insert = batchCalls.flat().find((statement) => statement.sql.includes("INSERT INTO meal_plan_substitutions"));
    const rows = insert ? JSON.parse(insert.params?.[0] as string) as Array<Record<string, unknown>> : [];
    return { rows, batchCalls };
  }

  it("deduplica a mesma substituicao vinda do template DIETA e do template SUBSTITUICAO", async () => {
    const { rows } = await createPlanFromTemplatesWithSubstitutions([
      { template_id: "tpl-dieta", base_food: "Arroz", option_food: "Batata", quantity: "100", unit: "g" },
      { template_id: "tpl-substituicao", base_food: "Arroz", option_food: "Batata", quantity: "100", unit: "g" },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ baseFood: "Arroz", optionFood: "Batata", quantity: "100", unit: "g" });
  });

  it("preserva substituicoes com quantidades diferentes", async () => {
    const { rows } = await createPlanFromTemplatesWithSubstitutions([
      { template_id: "tpl-dieta", base_food: "Arroz", option_food: "Batata", quantity: "100", unit: "g" },
      { template_id: "tpl-substituicao", base_food: "Arroz", option_food: "Batata", quantity: "150", unit: "g" },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.quantity)).toEqual(["100", "150"]);
  });

  it("preserva substituicoes com alimentos opcionais diferentes", async () => {
    const { rows } = await createPlanFromTemplatesWithSubstitutions([
      { template_id: "tpl-dieta", base_food: "Arroz", option_food: "Batata", quantity: null, unit: null },
      { template_id: "tpl-substituicao", base_food: "Arroz", option_food: "Mandioca", quantity: null, unit: null },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.optionFood)).toEqual(["Batata", "Mandioca"]);
  });

  it("mantem inalteradas as substituicoes quando os dados vem de uma unica fonte", async () => {
    const { rows } = await createPlanFromTemplatesWithSubstitutions([
      { template_id: "tpl-dieta", base_food: "Arroz", option_food: "Batata", quantity: "100", unit: "g" },
      { template_id: "tpl-dieta", base_food: "Feijao", option_food: "Lentilha", quantity: "1", unit: "concha" },
    ], ["tpl-dieta"]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.baseFood)).toEqual(["Arroz", "Feijao"]);
  });
});
