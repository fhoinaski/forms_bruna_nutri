import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("admin-food-usage — recentes (R4, seções 6-7)", () => {
  it("registra uso via upsert (nunca duplica linha pro mesmo alimento) e incrementa use_count no conflito", async () => {
    const d1Execute = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/d1/client", () => ({ d1Execute, d1Query: vi.fn().mockResolvedValue([]) }));
    const { recordFoodUsage } = await import("../lib/repositories/admin-food-usage");

    await recordFoodUsage({ adminId: "admin-1", foodSource: "TACO", foodRefId: "3" });

    expect(d1Execute).toHaveBeenCalledTimes(1);
    const [sql, params] = d1Execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO admin_food_usage");
    expect(sql).toContain("ON CONFLICT (admin_id, food_source, food_ref_id)");
    expect(sql).toContain("use_count = use_count + 1");
    expect(params).toEqual(expect.arrayContaining(["admin-1", "TACO", "3"]));
  });

  it("lista recentes ordenado por last_used_at DESC, escopado ao admin", async () => {
    const d1Query = vi.fn().mockResolvedValue([{ id: "1", admin_id: "admin-1", food_source: "TACO", food_ref_id: "3", use_count: 2, last_used_at: "2026-08-27T00:00:00.000Z", created_at: "2026-08-01T00:00:00.000Z" }]);
    vi.doMock("@/lib/d1/client", () => ({ d1Execute: vi.fn(), d1Query }));
    const { listRecentFoodUsage } = await import("../lib/repositories/admin-food-usage");

    const rows = await listRecentFoodUsage("admin-1", 20);
    expect(rows).toHaveLength(1);
    const [sql, params] = d1Query.mock.calls[0];
    expect(sql).toContain("WHERE admin_id = ?1");
    expect(sql).toContain("ORDER BY last_used_at DESC");
    expect(params[0]).toBe("admin-1");
  });

  it("nunca aceita fonte fora do enum canônico no schema (documentado, verificado pela constraint SQL da migration, não aqui)", async () => {
    // Nota: a validação de enum acontece na CHECK constraint do banco e no
    // zod da rota — este teste só documenta que o repositório passa a fonte
    // adiante sem reescrever/validar duas vezes (single source of truth).
    const d1Execute = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/d1/client", () => ({ d1Execute, d1Query: vi.fn() }));
    const { recordFoodUsage } = await import("../lib/repositories/admin-food-usage");
    await recordFoodUsage({ adminId: "admin-1", foodSource: "CUSTOM", foodRefId: "x" });
    expect(d1Execute.mock.calls[0][1]).toContain("CUSTOM");
  });
});

describe("admin-food-favorites — favoritar/desfavoritar (R4, seções 8-9)", () => {
  it("adiciona favorito com ON CONFLICT DO NOTHING (idempotente — favoritar duas vezes não duplica nem falha)", async () => {
    const d1Execute = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/d1/client", () => ({ d1Execute, d1Query: vi.fn() }));
    const { addFoodFavorite } = await import("../lib/repositories/admin-food-favorites");

    await addFoodFavorite({ adminId: "admin-1", foodSource: "TACO", foodRefId: "3" });
    const [sql] = d1Execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO admin_food_favorites");
    expect(sql).toContain("DO NOTHING");
  });

  it("remove favorito escopado ao admin (nunca remove de outro profissional)", async () => {
    const d1Execute = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/d1/client", () => ({ d1Execute, d1Query: vi.fn() }));
    const { removeFoodFavorite } = await import("../lib/repositories/admin-food-favorites");

    await removeFoodFavorite({ adminId: "admin-1", foodSource: "TACO", foodRefId: "3" });
    const [sql, params] = d1Execute.mock.calls[0];
    expect(sql).toContain("WHERE admin_id = ?1 AND food_source = ?2 AND food_ref_id = ?3");
    expect(params).toEqual(["admin-1", "TACO", "3"]);
  });

  it("lista favoritos ordenados por created_at DESC, escopado ao admin", async () => {
    const d1Query = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/d1/client", () => ({ d1Execute: vi.fn(), d1Query }));
    const { listFoodFavorites } = await import("../lib/repositories/admin-food-favorites");
    await listFoodFavorites("admin-1");
    const [sql, params] = d1Query.mock.calls[0];
    expect(sql).toContain("WHERE admin_id = ?1");
    expect(sql).toContain("ORDER BY created_at DESC");
    expect(params[0]).toBe("admin-1");
  });
});

describe("admin-saved-meals — refeições reutilizáveis (R4, seções 10/21-24/27)", () => {
  it("nunca persiste nutrição congelada, locks ou proveniência de slot — só estrutura + identidade canônica", async () => {
    const d1Execute = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/d1/client", () => ({ d1Execute, d1Query: vi.fn() }));
    const { saveMealForReuse } = await import("../lib/repositories/admin-saved-meals");

    const saved = await saveMealForReuse({
      adminId: "admin-1",
      name: "Café padrão",
      meal: {
        name: "Café padrão",
        items: [{
          food: "Pão integral", quantity: "50", unit: "g", food_source: "TACO", food_ref_id: "50",
          nutrition_snapshot: JSON.stringify({ energia_kcal: 999 }), food_name_snapshot: "congelado",
          quantity_locked: true, substitutions_locked: true,
          slot_food_group: "CARBOHYDRATE", template_slot_id: "slot-1",
        } as never],
      },
    });

    expect(saved.meal.items[0]).not.toHaveProperty("nutrition_snapshot");
    expect(saved.meal.items[0]).not.toHaveProperty("food_name_snapshot");
    expect(saved.meal.items[0]).not.toHaveProperty("quantity_locked");
    expect(saved.meal.items[0]).not.toHaveProperty("slot_food_group");
    expect(saved.meal.items[0].food_source).toBe("TACO");
    expect(saved.meal.items[0].food_ref_id).toBe("50");

    const [sql, params] = d1Execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO admin_saved_meals");
    const contentJson = params[4] as string;
    expect(contentJson).not.toContain("nutrition_snapshot");
    expect(contentJson).not.toContain("999");
  });

  it("preserva OPTIONS/COMBINATION completos (opções e grupos de escolha, com min/max)", async () => {
    const d1Execute = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/d1/client", () => ({ d1Execute, d1Query: vi.fn() }));
    const { saveMealForReuse } = await import("../lib/repositories/admin-saved-meals");

    const saved = await saveMealForReuse({
      adminId: "admin-1",
      name: "Almoço flexível",
      meal: {
        name: "Almoço flexível",
        meal_structure: "COMBINATION",
        items: [{ food: "Salada", quantity: "100", unit: "g" }],
        choice_groups: [{ title: "Proteína", min_selections: 1, max_selections: 1, items: [{ food: "Frango", quantity: "120", unit: "g" }] }],
      },
    });

    expect(saved.meal_structure).toBe("COMBINATION");
    expect(saved.meal.choice_groups).toHaveLength(1);
    expect(saved.meal.choice_groups![0].min_selections).toBe(1);
    expect(saved.meal.choice_groups![0].max_selections).toBe(1);
    expect(saved.meal.choice_groups![0].items[0].food).toBe("Frango");
  });

  it("lista/busca/exclui sempre escopados ao admin dono (nunca acessível por id de outro profissional)", async () => {
    const d1Query = vi.fn().mockResolvedValue([]);
    const d1Execute = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/d1/client", () => ({ d1Execute, d1Query }));
    const { listSavedMeals, getSavedMeal, deleteSavedMeal } = await import("../lib/repositories/admin-saved-meals");

    await listSavedMeals("admin-1");
    expect(d1Query.mock.calls[0][0]).toContain("WHERE admin_id = ?1");

    await getSavedMeal("admin-1", "meal-x");
    expect(d1Query.mock.calls[1][0]).toContain("WHERE admin_id = ?1 AND id = ?2");
    expect(d1Query.mock.calls[1][1]).toEqual(["admin-1", "meal-x"]);

    await deleteSavedMeal("admin-1", "meal-x");
    expect(d1Execute.mock.calls[0][0]).toContain("WHERE admin_id = ?1 AND id = ?2");
  });

  it("applySavedMeal nunca inclui um `id` de refeição/opção/grupo antigo — identity sempre nova no destino", () => {
    return import("../lib/repositories/admin-saved-meals").then(({ applySavedMeal }) => {
      const applied = applySavedMeal({
        id: "saved-1",
        admin_id: "admin-1",
        name: "Café",
        meal_structure: "SIMPLE",
        meal: { name: "Café", items: [{ food: "Pão", quantity: "50", unit: "g" }] } as never,
        usage_count: 0,
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-01T00:00:00.000Z",
      });
      expect(applied).not.toHaveProperty("id");
      expect(applied.items[0]).not.toHaveProperty("id");
    });
  });
});
