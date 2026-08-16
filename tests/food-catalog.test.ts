import { afterEach, describe, expect, it, vi } from "vitest";

const customRows = [
  {
    id: "custom-1",
    name: "Granola da Bruna",
    brand: null,
    source: "CUSTOM",
    portion_base_grams: 100,
    energy_kcal: 410,
    protein_g: 9,
    carbohydrate_g: 62,
    fat_g: 12,
    fiber_g: null,
    sodium_mg: null,
    calcium_mg: null,
    iron_mg: null,
    potassium_mg: null,
    vitamin_c_mg: null,
    notes: null,
    created_at: "now",
    updated_at: "now",
  },
  {
    id: "manufacturer-1",
    name: "Whey Protein Isolado",
    brand: "Marca X",
    source: "MANUFACTURER",
    portion_base_grams: 100,
    energy_kcal: 380,
    protein_g: 80,
    carbohydrate_g: 5,
    fat_g: 3,
    fiber_g: 0,
    sodium_mg: null,
    calcium_mg: null,
    iron_mg: null,
    potassium_mg: null,
    vitamin_c_mg: null,
    notes: null,
    created_at: "now",
    updated_at: "now",
  },
];

function mockCatalogRepositories() {
  vi.doMock("@/lib/repositories/custom-foods", async () => {
    const actual = await vi.importActual<typeof import("../lib/repositories/custom-foods")>("../lib/repositories/custom-foods");
    return {
      ...actual,
      listCustomFoods: vi.fn(async (query?: string) => {
        const normalized = String(query ?? "").toLowerCase();
        return customRows.filter((row) => `${row.name} ${row.brand ?? ""}`.toLowerCase().includes(normalized));
      }),
      getCustomFoodById: vi.fn(async (id: string) => customRows.find((row) => row.id === id) ?? null),
    };
  });
  vi.doMock("@/lib/repositories/food-portions", () => ({
    listFoodPortions: vi.fn(async (source: string, refId: string) => source === "TACO" && refId === "179"
      ? [{ id: "m-banana", food_source: "TACO", food_ref_id: "179", description: "1 unidade média", gram_equivalent: 86, source: "TBCA", source_version: null, confidence: "high", is_active: 1, created_at: "now" }]
      : []),
  }));
  vi.doMock("@/lib/repositories/usda-foods", () => ({
    searchUsdaFoods: vi.fn(async (query: string) => query.toLowerCase().includes("rice")
      ? [{
          id: "usda-1",
          source: "USDA",
          source_id: "USDA_SR_LEGACY:169756",
          upstream_source: "USDA_SR_LEGACY",
          upstream_source_id: "169756",
          original_name: "Rice, white, long-grain, regular, cooked",
          normalized_name: "rice white long grain regular cooked",
          food_group: "Cereal Grains and Pasta",
          data_quality: "COMPLETE",
          source_url: null,
          source_version: null,
          import_run_id: null,
          created_at: "now",
          energy_kcal: 130,
          protein_g: 2.69,
          carbohydrate_g: 28.17,
          fat_g: 0.28,
          fiber_g: 0.4,
        }]
      : []),
    getUsdaFoodBySourceId: vi.fn(async (id: string) => id === "USDA_SR_LEGACY:169756"
      ? {
          id: "usda-1",
          source: "USDA",
          source_id: "USDA_SR_LEGACY:169756",
          upstream_source: "USDA_SR_LEGACY",
          upstream_source_id: "169756",
          original_name: "Rice, white, long-grain, regular, cooked",
          normalized_name: "rice white long grain regular cooked",
          food_group: "Cereal Grains and Pasta",
          data_quality: "COMPLETE",
          source_url: null,
          source_version: null,
          import_run_id: null,
          created_at: "now",
        }
      : null),
    toUsdaMacroReference: vi.fn(async (food: { source_id: string; original_name: string; food_group: string | null }) => ({
      numero: food.source_id,
      descricao: food.original_name,
      grupo: food.food_group ?? undefined,
      fonte: "usda",
      energia_kcal: 130,
      proteina_g: 2.69,
      carboidrato_g: 28.17,
      lipidios_g: 0.28,
      calcio_mg: 10,
      ferro_mg: 1.2,
    })),
    toUsdaSearchMacroReference: vi.fn((food: { source_id: string; original_name: string; food_group: string | null; energy_kcal: number | null; protein_g: number | null; carbohydrate_g: number | null; fat_g: number | null; fiber_g: number | null }) => food.energy_kcal === null || food.protein_g === null || food.carbohydrate_g === null || food.fat_g === null ? null : ({
      numero: food.source_id,
      descricao: food.original_name,
      grupo: food.food_group ?? undefined,
      fonte: "usda",
      energia_kcal: food.energy_kcal,
      proteina_g: food.protein_g,
      carboidrato_g: food.carbohydrate_g,
      lipidios_g: food.fat_g,
      fibra_g: food.fiber_g,
    })),
  }));
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("food catalog service", () => {
  it("retorna referencia estavel e prioriza TACO para buscas brasileiras comuns", async () => {
    mockCatalogRepositories();
    const { searchFoods } = await import("../lib/nutrition/food-catalog");

    for (const query of ["arroz", "arroz cozido", "banana", "leite", "ovo", "feijão", "batata", "frango"]) {
      const [first] = await searchFoods({ query, limit: 5 });
      expect(first?.ref.source).toBe("TACO");
      expect(first?.ref.sourceId).toMatch(/^\d+$/);
      expect(first?.name.toLowerCase()).toContain(query.split(" ")[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "feijao" ? "feijão" : query.split(" ")[0].toLowerCase());
    }
  });

  it("mantem complementary como source distinta sem copiar dados", async () => {
    mockCatalogRepositories();
    const { searchFoods } = await import("../lib/nutrition/food-catalog");

    const results = await searchFoods({ query: "whey protein", sources: ["COMPLEMENTARY"], limit: 10 });
    expect(results.some((item) => item.ref.source === "COMPLEMENTARY")).toBe(true);
    expect(results.every((item) => item.ref.source === "COMPLEMENTARY")).toBe(true);
  });

  it("preserva null diferente de zero no summary", async () => {
    mockCatalogRepositories();
    const { searchFoods } = await import("../lib/nutrition/food-catalog");

    const [custom] = await searchFoods({ query: "Granola da Bruna", sources: ["CUSTOM"] });
    expect(custom.ref).toEqual({ source: "CUSTOM", sourceId: "custom-1" });
    expect(custom.fiberG).toBeNull();

    const [manufacturer] = await searchFoods({ query: "Marca X", sources: ["MANUFACTURER"] });
    expect(manufacturer.ref).toEqual({ source: "MANUFACTURER", sourceId: "manufacturer-1" });
    expect(manufacturer.fiberG).toBe(0);
  });

  it("rankeia match textual antes da prioridade de fonte para marca de fabricante", async () => {
    mockCatalogRepositories();
    const { searchFoods } = await import("../lib/nutrition/food-catalog");

    const [first] = await searchFoods({ query: "Marca X", limit: 10 });
    expect(first.ref.source).toBe("MANUFACTURER");
    expect(first.brand).toBe("Marca X");
  });

  it("encontra USDA para termo ingles sem deslocar TACO em buscas brasileiras", async () => {
    mockCatalogRepositories();
    const { searchFoods, getFoodByReference } = await import("../lib/nutrition/food-catalog");
    const usdaRepo = await import("../lib/repositories/usda-foods");

    const [rice] = await searchFoods({ query: "rice", limit: 5 });
    expect(rice.ref).toEqual({ source: "USDA", sourceId: "USDA_SR_LEGACY:169756" });
    expect(rice.sourceLabel).toBe("USDA");

    vi.mocked(usdaRepo.searchUsdaFoods).mockClear();
    const [arroz] = await searchFoods({ query: "arroz", limit: 5 });
    expect(arroz.ref.source).toBe("TACO");
    expect(usdaRepo.searchUsdaFoods).not.toHaveBeenCalled();

    const details = await getFoodByReference({ source: "USDA", sourceId: "USDA_SR_LEGACY:169756" });
    expect(details?.macroReference.fonte).toBe("usda");
  });

  it("busca sem acento encontra nome com acento e preserva apresentacao original", async () => {
    mockCatalogRepositories();
    const { searchFoods } = await import("../lib/nutrition/food-catalog");

    const results = await searchFoods({ query: "acai", limit: 5 });
    expect(results[0].name).toContain("Açaí");
  });

  it("resolve detalhes e porcoes por referencia sem misturar fontes", async () => {
    mockCatalogRepositories();
    const { getFoodByReference, getFoodPortions } = await import("../lib/nutrition/food-catalog");

    const banana = await getFoodByReference({ source: "TACO", sourceId: "179" });
    expect(banana?.name).toContain("Banana");
    expect(banana?.energyKcal).toEqual(expect.any(Number));

    const portions = await getFoodPortions({ source: "TACO", sourceId: "179" });
    expect(portions).toHaveLength(1);
    expect(portions[0]).toMatchObject({
      id: "m-banana",
      foodRef: { source: "TACO", sourceId: "179" },
      label: "1 unidade média",
      unitKind: "medium_unit",
      gramWeight: 86,
      source: "TBCA",
    });
    expect(await getFoodPortions({ source: "CUSTOM", sourceId: "179" })).toEqual([]);
  });

  it("impoe limite seguro de resultados", async () => {
    mockCatalogRepositories();
    const { searchFoods } = await import("../lib/nutrition/food-catalog");

    const results = await searchFoods({ query: "a", limit: 999 });
    expect(results).toEqual([]);

    const capped = await searchFoods({ query: "arroz", limit: 999 });
    expect(capped.length).toBeLessThanOrEqual(50);
  });
});
