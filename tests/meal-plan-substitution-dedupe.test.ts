import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regressao do bug real encontrado em auditoria: substituicoes apareciam
 * duplicadas no Portal do Paciente porque o dedupe (adicionado em
 * createMealPlanFromTemplates, commit 92cf3f1) nunca foi aplicado ao caminho
 * geral de escrita (createMealPlan/updateMealPlan, via
 * buildMealPlanDetailStatements) nem ao caminho de leitura (hydrateMealPlans)
 * — planos gravados antes do fix (ou por qualquer chamador que nao passasse
 * por createMealPlanFromTemplates) continuavam com linhas duplicadas na
 * tabela meal_plan_substitutions, exibidas 2x no portal.
 *
 * Identidade de deduplicacao: base_food + option_food + quantity + unit
 * (normalizados — trim, espacos colapsados, case-insensitive). Nunca colapsa
 * substituicoes com origem/destino ou quantidade genuinamente diferentes.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const PLAN_ROW = {
  id: "plan-1",
  client_id: "client-1",
  title: "Plano",
  target_group: null,
  status: "draft",
  version: 1,
  notes: null,
  target_energy_kcal: null,
  target_protein_g: null,
  target_carbohydrate_g: null,
  target_fat_g: null,
  created_at: "now",
  updated_at: "now",
};

function mockD1(extraQueryResults: Record<string, unknown> = {}) {
  const batchCalls: { sql: string; params?: unknown[] }[][] = [];
  const d1Batch = vi.fn(async (statements: { sql: string; params?: unknown[] }[]) => {
    batchCalls.push(statements);
    return statements.map(() => ({ results: [], success: true }));
  });
  const d1Query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM meal_plans")) return [PLAN_ROW];
    return (extraQueryResults[sql] as unknown[]) ?? [];
  });
  vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query, d1Execute: vi.fn() }));
  vi.doMock("@/lib/repositories/protocol-templates", () => ({ getAllTemplates: vi.fn() }));
  vi.doMock("@/lib/security/encrypted-fields", () => ({ encryptJsonValue: (v: unknown) => `encj:${JSON.stringify(v)}` }));
  return { batchCalls, d1Batch, d1Query };
}

function substitutionInsertRows(batchCalls: { sql: string; params?: unknown[] }[][]) {
  const insert = batchCalls.flat().find((statement) => statement.sql.includes("INSERT INTO meal_plan_substitutions"));
  if (!insert) return [];
  return JSON.parse(insert.params![0] as string) as Array<{ baseFood: string; optionFood: string; quantity: string | null; unit: string | null }>;
}

describe("lib/repositories/meal-plans.ts — dedupe de substituicoes na ESCRITA", () => {
  it("createMealPlan: mesma substituicao vinda de duas fontes (base/option/qty/unit identicos) → persiste 1 linha", async () => {
    const { batchCalls } = mockD1();
    const { createMealPlan } = await import("../lib/repositories/meal-plans");

    await createMealPlan({
      clientId: "client-1",
      title: "Plano",
      meals: [],
      substitutions: [
        { base_food: "Arroz cozido", option_food: "Batata inglesa cozida", quantity: "150", unit: "g" },
        // "duas fontes" simulado: mesmo conteudo semantico, so variando espacos/maiusculas —
        // exatamente o cenario real (template DIETA + template SUBSTITUICAO com a mesma sugestao)
        { base_food: "  arroz cozido ", option_food: "Batata Inglesa Cozida", quantity: "150", unit: "g" },
      ],
      supplements: [],
    });

    const rows = substitutionInsertRows(batchCalls);
    expect(rows).toHaveLength(1);
    expect(rows[0].baseFood).toBe("Arroz cozido");
  });

  it("createMealPlan: mesma origem/destino mas quantidade diferente → persiste 2 linhas distintas", async () => {
    const { batchCalls } = mockD1();
    const { createMealPlan } = await import("../lib/repositories/meal-plans");

    await createMealPlan({
      clientId: "client-1",
      title: "Plano",
      meals: [],
      substitutions: [
        { base_food: "Arroz cozido", option_food: "Batata inglesa cozida", quantity: "150", unit: "g" },
        { base_food: "Arroz cozido", option_food: "Batata inglesa cozida", quantity: "200", unit: "g" },
      ],
      supplements: [],
    });

    const rows = substitutionInsertRows(batchCalls);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.quantity).sort()).toEqual(["150", "200"]);
  });

  it("createMealPlan: destinos diferentes para a mesma origem → persiste 2 linhas distintas", async () => {
    const { batchCalls } = mockD1();
    const { createMealPlan } = await import("../lib/repositories/meal-plans");

    await createMealPlan({
      clientId: "client-1",
      title: "Plano",
      meals: [],
      substitutions: [
        { base_food: "Peito de frango grelhado", option_food: "Ovos cozidos", quantity: "2", unit: "un" },
        { base_food: "Peito de frango grelhado", option_food: "File de tilapia grelhado", quantity: "120", unit: "g" },
      ],
      supplements: [],
    });

    const rows = substitutionInsertRows(batchCalls);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.optionFood).sort()).toEqual(["File de tilapia grelhado", "Ovos cozidos"]);
  });

  it("updateMealPlan (salvar no editor / propostas de IA / plano legado sendo resalvo): mesma protecao contra duplicata", async () => {
    const { batchCalls } = mockD1();
    const { updateMealPlan } = await import("../lib/repositories/meal-plans");

    await updateMealPlan("plan-1", "client-1", {
      title: "Plano",
      status: "draft",
      meals: [],
      substitutions: [
        { base_food: "Banana", option_food: "Maca", quantity: "1", unit: "un" },
        { base_food: "Banana", option_food: "Maca", quantity: "1", unit: "un" },
      ],
      supplements: [],
    });

    const rows = substitutionInsertRows(batchCalls);
    expect(rows).toHaveLength(1);
  });
});

describe("lib/repositories/meal-plans.ts — dedupe de substituicoes na LEITURA (dado legado)", () => {
  it("getMealPlanById: linhas duplicadas ja gravadas no banco (plano legado, anterior ao fix) aparecem 1x na leitura", async () => {
    const substitutionRows = [
      { id: "sub-1", meal_plan_id: "plan-1", base_food: "Arroz cozido", option_food: "Batata inglesa cozida", quantity: "150", unit: "g", sort_order: 0 },
      { id: "sub-2", meal_plan_id: "plan-1", base_food: "Peito de frango grelhado", option_food: "Ovos cozidos", quantity: "2", unit: "un", sort_order: 1 },
      { id: "sub-3", meal_plan_id: "plan-1", base_food: "Arroz cozido", option_food: "Batata inglesa cozida", quantity: "150", unit: "g", sort_order: 2 },
      { id: "sub-4", meal_plan_id: "plan-1", base_food: "Peito de frango grelhado", option_food: "Ovos cozidos", quantity: "2", unit: "un", sort_order: 3 },
    ];
    const d1Batch = vi.fn(async (statements: { sql: string }[]) =>
      statements.map((statement) => {
        if (statement.sql.includes("FROM meal_plan_substitutions")) return { results: substitutionRows, success: true };
        return { results: [], success: true };
      })
    );
    const d1Query = vi.fn().mockResolvedValue([PLAN_ROW]);
    vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query, d1Execute: vi.fn() }));
    vi.doMock("@/lib/repositories/protocol-templates", () => ({ getAllTemplates: vi.fn() }));
    vi.doMock("@/lib/security/encrypted-fields", () => ({ encryptJsonValue: (v: unknown) => `encj:${JSON.stringify(v)}` }));
    const { getMealPlanById } = await import("../lib/repositories/meal-plans");

    const plan = await getMealPlanById("plan-1");

    expect(plan?.substitutions).toHaveLength(2);
    expect(plan?.substitutions.map((s) => s.base_food).sort()).toEqual(["Arroz cozido", "Peito de frango grelhado"]);
  });

  it("getMealPlanById: nunca colapsa substituicoes legitimamente diferentes (quantidade e destino distintos)", async () => {
    const substitutionRows = [
      { id: "sub-1", meal_plan_id: "plan-1", base_food: "Arroz cozido", option_food: "Batata inglesa cozida", quantity: "150", unit: "g", sort_order: 0 },
      { id: "sub-2", meal_plan_id: "plan-1", base_food: "Arroz cozido", option_food: "Batata inglesa cozida", quantity: "200", unit: "g", sort_order: 1 },
      { id: "sub-3", meal_plan_id: "plan-1", base_food: "Peito de frango grelhado", option_food: "Ovos cozidos", quantity: "2", unit: "un", sort_order: 2 },
      { id: "sub-4", meal_plan_id: "plan-1", base_food: "Peito de frango grelhado", option_food: "File de tilapia grelhado", quantity: "120", unit: "g", sort_order: 3 },
    ];
    const d1Batch = vi.fn(async (statements: { sql: string }[]) =>
      statements.map((statement) => {
        if (statement.sql.includes("FROM meal_plan_substitutions")) return { results: substitutionRows, success: true };
        return { results: [], success: true };
      })
    );
    const d1Query = vi.fn().mockResolvedValue([PLAN_ROW]);
    vi.doMock("@/lib/d1/client", () => ({ d1Batch, d1Query, d1Execute: vi.fn() }));
    vi.doMock("@/lib/repositories/protocol-templates", () => ({ getAllTemplates: vi.fn() }));
    vi.doMock("@/lib/security/encrypted-fields", () => ({ encryptJsonValue: (v: unknown) => `encj:${JSON.stringify(v)}` }));
    const { getMealPlanById } = await import("../lib/repositories/meal-plans");

    const plan = await getMealPlanById("plan-1");

    expect(plan?.substitutions).toHaveLength(4);
  });
});
