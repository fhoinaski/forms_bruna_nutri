import { describe, expect, it } from "vitest";

const core: any = await import("../scripts/lib/food-kb-import-core.mjs");

const {
  buildImportPlan,
  classifyCandidate,
  coerceNutritionNumber,
  normalizeSourceId,
  projectTacoRowsToCatalog,
} = core;

function candidate(overrides: Record<string, unknown> = {}) {
  const source = String(overrides.source ?? "TACO");
  const sourceId = String(overrides.sourceId ?? "TACO4:1");
  const nutrients =
    overrides.nutrients === null
      ? null
      : {
          energyKcal: 123,
          proteinG: 2,
          carbohydrateG: 25,
          fatG: 1,
          fiberG: null,
          sodiumMg: 0,
          calciumMg: null,
          ironMg: null,
          potassiumMg: null,
          vitaminCMg: null,
          ...(overrides.nutrients as Record<string, unknown> | undefined),
        };
  return {
    source,
    sourceId,
    normalizedSourceId: normalizeSourceId(source, sourceId),
    name: String(overrides.name ?? "Arroz, integral, cozido"),
    normalizedName: "arroz integral cozido",
    upstreamSource: overrides.upstreamSource,
    basis: overrides.basis,
    isBranded: overrides.isBranded,
    isRecipe: overrides.isRecipe,
    canonicalAudit: overrides.canonicalAudit,
    nutrients,
    aliases: overrides.aliases ?? [],
    portions: overrides.portions ?? [],
  };
}

function existing(overrides: Record<string, unknown> = {}) {
  return {
    source: String(overrides.source ?? "TACO"),
    sourceId: String(overrides.sourceId ?? "1"),
    name: String(overrides.name ?? "Arroz, integral, cozido"),
    nutrients: {
      energyKcal: 123,
      proteinG: 2,
      carbohydrateG: 25,
      fatG: 1,
      fiberG: null,
      sodiumMg: 0,
      calciumMg: null,
      ironMg: null,
      potassiumMg: null,
      vitaminCMg: null,
      ...(overrides.nutrients as Record<string, unknown> | undefined),
    },
  };
}

describe("food KB importer core", () => {
  it("normaliza identidade TACO por source + source_id sem duplicar TACO existente", () => {
    const plan = buildImportPlan({ source: "TACO", candidates: [candidate()], existingFoods: [existing()] });

    expect(normalizeSourceId("TACO", "TACO4:1")).toBe("1");
    expect(plan.summary.existing).toBe(1);
    expect(plan.summary.new).toBe(0);
    expect(plan.actions.NOOP).toHaveLength(1);
  });

  it("planeja CREATE para alimento novo sem escrever nada", () => {
    const plan = buildImportPlan({ source: "TACO", candidates: [candidate({ sourceId: "TACO4:99" })], existingFoods: [existing()] });

    expect(plan.dryRun).toBe(true);
    expect(plan.summary.new).toBe(1);
    expect(plan.actions.CREATE[0].sourceId).toBe("TACO4:99");
  });

  it("planeja ENRICH apenas quando V3 preenche campo nulo do projeto", () => {
    const plan = buildImportPlan({
      source: "TACO",
      candidates: [candidate({ nutrients: { fiberG: 3 } })],
      existingFoods: [existing({ nutrients: { fiberG: null } })],
    });

    expect(plan.summary.enrich).toBe(1);
    expect(plan.actions.ENRICH[0].enriches).toEqual([{ key: "fiberG", v3Value: 3, projectValue: null }]);
  });

  it("nao sobrescreve conflito nutricional", () => {
    const result = classifyCandidate(candidate({ nutrients: { energyKcal: 130 } }), existing({ nutrients: { energyKcal: 123 } }));

    expect(result.action).toBe("CONFLICT");
    expect(result.category).toBe("VALUE_CONFLICT");
    expect(result.conflicts[0].key).toBe("energyKcal");
  });

  it("preserva null diferente de zero", () => {
    const plan = buildImportPlan({
      source: "TACO",
      candidates: [candidate({ nutrients: { fiberG: null, sodiumMg: 0 } })],
      existingFoods: [],
    });

    expect(coerceNutritionNumber("NA")).toBeNull();
    expect(coerceNutritionNumber("Tr")).toBe(0);
    expect(plan.nulls.fiberG).toBe(1);
    expect(plan.zeros.sodiumMg).toBe(1);
  });

  it("rerun idempotente mantem o mesmo plano para a mesma entrada", () => {
    const input = { source: "TACO", candidates: [candidate()], existingFoods: [existing()] };

    expect(buildImportPlan(input).summary).toEqual(buildImportPlan(input).summary);
    expect(buildImportPlan(input).reconciliation.counts).toEqual(buildImportPlan(input).reconciliation.counts);
  });

  it("respeita --limit antes da classificacao", () => {
    const plan = buildImportPlan({
      source: "TACO",
      candidates: [candidate({ sourceId: "TACO4:1" }), candidate({ sourceId: "TACO4:2" })],
      existingFoods: [],
      limit: 1,
    });

    expect(plan.summary.found).toBe(1);
    expect(plan.summary.new).toBe(1);
  });

  it("aceita TACO/TBCA/USDA como targets e bloqueia upstream USDA direto", () => {
    expect(() => buildImportPlan({ source: "USDA_FOUNDATION", candidates: [], existingFoods: [] })).toThrow("Fonte nao suportada");
    expect(buildImportPlan({ source: "TBCA", candidates: [candidate({ source: "TBCA", sourceId: "BRC0003A" })], existingFoods: [] }).summary.source).toBe("TBCA");
    expect(buildImportPlan({ source: "USDA", candidates: [candidate({ source: "USDA", sourceId: "USDA_SR_LEGACY:1", upstreamSource: "USDA_SR_LEGACY", basis: "100_g" })], existingFoods: [] }).summary.source).toBe("USDA");
  });

  it("rejeita candidato sem nutrientes em dry-run tecnico TBCA", () => {
    const plan = buildImportPlan({
      source: "TBCA",
      candidates: [candidate({ source: "TBCA", sourceId: "BRC0003A", nutrients: null })],
      existingFoods: [],
    });

    expect(plan.summary.rejected).toBe(1);
    expect(plan.rejectedReasons.NUTRIENTS_NOT_FOUND).toBe(1);
  });

  it("converte rows locais TACO sem transformar ausente em zero nos micronutrientes", () => {
    const [food] = projectTacoRowsToCatalog([
      { numero: 1, descricao: "Teste", grupo: "Grupo", energia_kcal: "0", proteina_g: "Tr", carboidrato_g: "NA", lipidios_g: 0, fibra_g: "NA" },
    ]);

    expect(food.nutrients.energyKcal).toBe(0);
    expect(food.nutrients.proteinG).toBe(0);
    expect(food.nutrients.carbohydrateG).toBe(0);
    expect(food.nutrients.fiberG).toBeNull();
  });

  it("dry-run USDA rejeita branded e macros obrigatorios ausentes sem importar", () => {
    const plan = buildImportPlan({
      source: "USDA",
      candidates: [
        candidate({ source: "USDA", sourceId: "USDA_SR_LEGACY:1", upstreamSource: "USDA_SR_LEGACY", basis: "100_g", isBranded: true }),
        candidate({ source: "USDA", sourceId: "USDA_SR_LEGACY:2", upstreamSource: "USDA_SR_LEGACY", basis: "100_g", nutrients: { carbohydrateG: null } }),
      ],
      existingFoods: [],
    });

    expect(plan.summary.rejected).toBe(2);
    expect(plan.rejectedReasons.BRANDED_FOOD).toBe(1);
    expect(plan.rejectedReasons.MISSING_REQUIRED_carbohydrateG).toBe(1);
  });

  it("dry-run USDA conta nutrient rows no modelo LONG preservando NULL fora do plano", () => {
    const plan = buildImportPlan({
      source: "USDA",
      candidates: [candidate({
        source: "USDA",
        sourceId: "USDA_SR_LEGACY:3",
        upstreamSource: "USDA_SR_LEGACY",
        basis: "100_g",
        nutrients: { calciumMg: 10, vitaminAMcg: null, seleniumMcg: 7.5 },
      })],
      existingFoods: [],
    });

    expect(plan.summary.new).toBe(1);
    expect(plan.summary.plannedRows.foods).toBe(1);
    expect(plan.summary.plannedRows.nutrients).toBeGreaterThan(4);
    expect(plan.nutrientAvailability.calciumMg).toBe(1);
    expect(plan.nulls.vitaminAMcg).toBe(1);
  });
});
