import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * FASE 8 — auditoria/migração dos templates existentes (protocol_templates)
 * pro modelo estruturado por grupo/subgrupo/nutritionalRole/slot, SEM criar
 * biblioteca paralela. Cobre: proveniência (template_id/template_version)
 * carimbada no plano criado "por modelo", classificação de slot propagada
 * pro meal_plan_item criado, e o guard que faz "Criar por modelo" falhar
 * explicitamente (em vez de criar um plano vazio silenciosamente) quando um
 * grupo não tem nenhum template DIETA ativo (gap real: Bariátrico/Renal/
 * Oncológico).
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const PLAN_ROW = {
  id: "plan-1",
  client_id: "client-1",
  title: "Plano",
  target_group: "ADULTO_SAUDAVEL",
  status: "draft",
  version: 1,
  notes: null,
  target_energy_kcal: null,
  target_protein_g: null,
  target_carbohydrate_g: null,
  target_fat_g: null,
  created_at: "now",
  updated_at: "now",
  template_id: null,
  template_version: null,
};

function mockRelationalTemplate() {
  const batchCalls: Array<Array<{ sql: string; params?: unknown[] }>> = [];
  const d1Batch = vi.fn(async (statements: Array<{ sql: string; params?: unknown[] }>) => {
    batchCalls.push(statements);
    if (statements[0]?.sql.includes("FROM diet_template_meals")) {
      return [
        { results: [{ id: "meal-1", template_id: "tpl-adulto-dieta-base", name: "Almoço", suggested_time: null, notes: null, source_recipe_id: null, sort_order: 0 }], success: true },
        { results: [{ id: "item-1", meal_id: "meal-1", food: "Arroz integral cozido", quantity: "120", unit: "g", notes: null, sort_order: 0 }], success: true },
        { results: [], success: true },
        { results: [], success: true },
      ];
    }
    return statements.map(() => ({ results: [], success: true }));
  });
  const d1Query = vi.fn().mockResolvedValue([PLAN_ROW]);
  vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query, d1Execute: vi.fn() }));
  vi.doMock("@/lib/security/encrypted-fields", () => ({ encryptJsonValue: (v: unknown) => `encj:${JSON.stringify(v)}` }));
  return { batchCalls, d1Batch, d1Query };
}

describe("createMealPlanFromTemplates — proveniência (item 13)", () => {
  it("carimba template_id/template_version no plano quando existe exatamente 1 template DIETA ativo pro grupo", async () => {
    const { batchCalls } = mockRelationalTemplate();
    vi.doMock("@/lib/repositories/protocol-templates", () => ({
      getAllTemplates: vi.fn().mockResolvedValue([
        { id: "tpl-adulto-dieta-base", type: "DIETA", target_group: "ADULTO_SAUDAVEL", title: "t", content: "{}", notes: null, is_active: 1, created_at: "now", updated_at: "now", clinical_risk_level: "low", requires_professional_review: 0, version: 3, structure_version: "v2" },
      ]),
      getSlotClassificationBySourceItemId: vi.fn().mockResolvedValue(new Map([
        ["item-1", { food_group: "CARBOHYDRATE", food_subgroup: "GRAIN", nutritional_role: "STARCH_SOURCE" }],
      ])),
    }));
    const { createMealPlanFromTemplates } = await import("../lib/repositories/meal-plans");

    await createMealPlanFromTemplates({ clientId: "client-1", targetGroup: "ADULTO_SAUDAVEL" });

    const insertPlan = batchCalls.flat().find((s) => s.sql.includes("INSERT INTO meal_plans"));
    expect(insertPlan?.params).toContain("tpl-adulto-dieta-base");
    expect(insertPlan?.params).toContain(3);
  });

  it("carimba slot_food_group/subgroup/role no meal_plan_item quando o item de origem já foi classificado", async () => {
    const { batchCalls } = mockRelationalTemplate();
    vi.doMock("@/lib/repositories/protocol-templates", () => ({
      getAllTemplates: vi.fn().mockResolvedValue([
        { id: "tpl-adulto-dieta-base", type: "DIETA", target_group: "ADULTO_SAUDAVEL", title: "t", content: "{}", notes: null, is_active: 1, created_at: "now", updated_at: "now", clinical_risk_level: "low", requires_professional_review: 0, version: 3, structure_version: "v2" },
      ]),
      getSlotClassificationBySourceItemId: vi.fn().mockResolvedValue(new Map([
        ["item-1", { food_group: "CARBOHYDRATE", food_subgroup: "GRAIN", nutritional_role: "STARCH_SOURCE" }],
      ])),
    }));
    const { createMealPlanFromTemplates } = await import("../lib/repositories/meal-plans");

    await createMealPlanFromTemplates({ clientId: "client-1", targetGroup: "ADULTO_SAUDAVEL" });

    const insertItems = batchCalls.flat().find((s) => s.sql.includes("INSERT INTO meal_plan_items"));
    const rows = JSON.parse(insertItems!.params![0] as string) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slotFoodGroup: "CARBOHYDRATE", slotFoodSubgroup: "GRAIN", slotNutritionalRole: "STARCH_SOURCE" });
  });

  it("bloqueia importação quando há mais de um template DIETA ativo pro grupo sem default determinístico", async () => {
    const { d1Batch } = mockRelationalTemplate();
    // segundo template DIETA sem refeições relacionais (cai pro fallback de content vazio) — só testando a ambiguidade da contagem
    d1Batch.mockImplementationOnce(async (statements: Array<{ sql: string; params?: unknown[] }>) => {
      if (statements[0]?.sql.includes("FROM diet_template_meals")) {
        return [
          { results: [{ id: "meal-1", template_id: "tpl-a", name: "Almoço", suggested_time: null, notes: null, source_recipe_id: null, sort_order: 0 }], success: true },
          { results: [{ id: "item-1", meal_id: "meal-1", food: "Arroz integral cozido", quantity: "120", unit: "g", notes: null, sort_order: 0 }], success: true },
          { results: [], success: true },
          { results: [], success: true },
        ];
      }
      return statements.map(() => ({ results: [], success: true }));
    });
    vi.doMock("@/lib/repositories/protocol-templates", () => ({
      getAllTemplates: vi.fn().mockResolvedValue([
        { id: "tpl-a", type: "DIETA", target_group: "SOP", title: "a", content: "{}", notes: null, is_active: 1, created_at: "now", updated_at: "now", clinical_risk_level: "low", requires_professional_review: 0, version: 1, structure_version: "legacy" },
        { id: "tpl-b", type: "DIETA", target_group: "SOP", title: "b", content: '{"Café da manhã":{"opcoes":["Ovo"]}}', notes: null, is_active: 1, created_at: "now", updated_at: "now", clinical_risk_level: "low", requires_professional_review: 0, version: 1, structure_version: "legacy" },
      ]),
      getSlotClassificationBySourceItemId: vi.fn().mockResolvedValue(new Map()),
    }));
    const { createMealPlanFromTemplates, AmbiguousTemplateForTargetGroupError } = await import("../lib/repositories/meal-plans");

    await expect(createMealPlanFromTemplates({ clientId: "client-1", targetGroup: "SOP" })).rejects.toThrow(AmbiguousTemplateForTargetGroupError);
  });
});

describe("createMealPlanFromTemplates — contrato funcional do slot (Fase 8.5, item 2)", () => {
  it("template_slot_id e slot_exchange_eligible=true chegam no INSERT INTO meal_plan_items", async () => {
    const { batchCalls } = mockRelationalTemplate();
    vi.doMock("@/lib/repositories/protocol-templates", () => ({
      getAllTemplates: vi.fn().mockResolvedValue([
        { id: "tpl-adulto-dieta-base", type: "DIETA", target_group: "ADULTO_SAUDAVEL", title: "t", content: "{}", notes: null, is_active: 1, created_at: "now", updated_at: "now", clinical_risk_level: "low", requires_professional_review: 0, version: 3, structure_version: "v2" },
      ]),
      getSlotClassificationBySourceItemId: vi.fn().mockResolvedValue(new Map([
        ["item-1", { slot_id: "slot-abc", food_group: "CARBOHYDRATE", food_subgroup: "GRAIN", nutritional_role: "STARCH_SOURCE", exchange_eligible: true }],
      ])),
    }));
    const { createMealPlanFromTemplates } = await import("../lib/repositories/meal-plans");

    await createMealPlanFromTemplates({ clientId: "client-1", targetGroup: "ADULTO_SAUDAVEL" });

    const insertItems = batchCalls.flat().find((s) => s.sql.includes("INSERT INTO meal_plan_items"));
    const rows = JSON.parse(insertItems!.params![0] as string) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ templateSlotId: "slot-abc", slotExchangeEligible: 1 });
  });

  it("slot_exchange_eligible=false (ex.: água/tempero) chega como 0, nunca 1 nem null", async () => {
    const { batchCalls } = mockRelationalTemplate();
    vi.doMock("@/lib/repositories/protocol-templates", () => ({
      getAllTemplates: vi.fn().mockResolvedValue([
        { id: "tpl-adulto-dieta-base", type: "DIETA", target_group: "ADULTO_SAUDAVEL", title: "t", content: "{}", notes: null, is_active: 1, created_at: "now", updated_at: "now", clinical_risk_level: "low", requires_professional_review: 0, version: 3, structure_version: "v2" },
      ]),
      getSlotClassificationBySourceItemId: vi.fn().mockResolvedValue(new Map([
        ["item-1", { slot_id: "slot-water", food_group: "OTHER", food_subgroup: "OTHER_SUBGROUP", nutritional_role: "MIXED_ROLE", exchange_eligible: false }],
      ])),
    }));
    const { createMealPlanFromTemplates } = await import("../lib/repositories/meal-plans");

    await createMealPlanFromTemplates({ clientId: "client-1", targetGroup: "ADULTO_SAUDAVEL" });

    const insertItems = batchCalls.flat().find((s) => s.sql.includes("INSERT INTO meal_plan_items"));
    const rows = JSON.parse(insertItems!.params![0] as string) as Array<Record<string, unknown>>;
    expect(rows[0].slotExchangeEligible).toBe(0);
  });
});

describe("createMealPlanFromTemplates — gap real: grupo sem nenhum template DIETA (item 1/15)", () => {
  it("lança NoTemplateForTargetGroupError em vez de criar um plano vazio silenciosamente", async () => {
    mockRelationalTemplate();
    vi.doMock("@/lib/repositories/protocol-templates", () => ({
      getAllTemplates: vi.fn().mockResolvedValue([]),
      getSlotClassificationBySourceItemId: vi.fn().mockResolvedValue(new Map()),
    }));
    const { createMealPlanFromTemplates, NoTemplateForTargetGroupError } = await import("../lib/repositories/meal-plans");

    await expect(createMealPlanFromTemplates({ clientId: "client-1", targetGroup: "BARIATRICO" })).rejects.toThrow(NoTemplateForTargetGroupError);
  });
});

describe("getTemplateStructure — modelo novo por slot (item 3)", () => {
  it("monta refeições -> slots -> alimentos-sugestão a partir das tabelas relacionais", async () => {
    const d1Query = vi.fn().mockResolvedValue([{
      id: "tpl-1", type: "DIETA", target_group: "ADULTO_SAUDAVEL", title: "Dieta base", content: "", notes: "obs",
      is_active: 1, created_at: "now", updated_at: "now",
      clinical_risk_level: "low", requires_professional_review: 0, version: 2, structure_version: "v2",
    }]);
    const d1Batch = vi.fn(async () => [
      { results: [{ id: "meal-1", template_id: "tpl-1", name: "Almoço", suggested_time: "12:00", notes: null, source_recipe_id: null, sort_order: 0 }], success: true },
      { results: [{ id: "slot-1", meal_id: "meal-1", food_group: "CARBOHYDRATE", food_subgroup: "GRAIN", nutritional_role: "STARCH_SOURCE", required: 1, exchange_eligible: 1, min_items: 1, max_items: 1, sort_order: 0 }], success: true },
      { results: [{ slot_id: "slot-1", food: "Arroz integral cozido", quantity: "120", unit: "g", source_item_id: "item-1", sort_order: 0 }], success: true },
    ]);
    vi.doUnmock("@/lib/repositories/protocol-templates");
    vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query, d1Execute: vi.fn() }));
    const { getTemplateStructure } = await import("../lib/repositories/protocol-templates");

    const structure = await getTemplateStructure("tpl-1");

    expect(structure).not.toBeNull();
    expect(structure?.meals).toHaveLength(1);
    expect(structure?.meals[0].slots).toHaveLength(1);
    expect(structure?.meals[0].slots[0]).toMatchObject({
      foodGroup: "CARBOHYDRATE",
      foodSubgroup: "GRAIN",
      nutritionalRole: "STARCH_SOURCE",
      required: true,
      exchangeEligible: true,
    });
    expect(structure?.meals[0].slots[0].suggestedFoods).toEqual([{ food: "Arroz integral cozido", quantity: "120", unit: "g", foodSource: null, foodRefId: null, canonicalFoodId: null }]);
  });

  it("retorna null quando o template não existe", async () => {
    const d1Query = vi.fn().mockResolvedValue([]);
    const d1Batch = vi.fn();
    vi.doUnmock("@/lib/repositories/protocol-templates");
    vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query, d1Execute: vi.fn() }));
    const { getTemplateStructure } = await import("../lib/repositories/protocol-templates");

    expect(await getTemplateStructure("missing")).toBeNull();
  });
});
