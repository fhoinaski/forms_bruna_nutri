import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * FASE 1 (operador interno) — tools de catalogo de alimentos sempre
 * disponiveis, mesmo sem cliente em contexto
 * (lib/ai/agents/food/food-catalog-agent.ts). Resolve o bug real relatado:
 * "quantas calorias tem 100 gramas de arroz?" respondendo "nao tenho como
 * consultar" quando havia dado disponivel no catalogo.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("executeSearchFoods", () => {
  it("acha o alimento real da TACO pelo nome, sem inventar dado", async () => {
    vi.doMock("@/lib/repositories/custom-foods", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/custom-foods")>("../lib/repositories/custom-foods");
      return { ...actual, listCustomFoods: vi.fn().mockResolvedValue([]) };
    });
    const { executeSearchFoods } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeSearchFoods({ query: "Arroz, tipo 1, cozido" });
    const match = result.items.find((item) => item.descricao === "Arroz, tipo 1, cozido");
    expect(match).toBeDefined();
    expect(match!.source).toBe("TACO");
    expect(match!.refId).toBe("3");
    expect(match!.kcal_100g).toBeCloseTo(128.2585, 2);
  });

  it("uma busca genérica ('arroz') devolve varios candidatos — ambiguidade real, nunca escolhida sozinha pelo codigo", async () => {
    vi.doMock("@/lib/repositories/custom-foods", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/custom-foods")>("../lib/repositories/custom-foods");
      return { ...actual, listCustomFoods: vi.fn().mockResolvedValue([]) };
    });
    const { executeSearchFoods } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeSearchFoods({ query: "arroz" });
    expect(result.items.length).toBeGreaterThan(1);
  });

  it("alimento inexistente no catalogo devolve lista vazia, nunca um resultado inventado", async () => {
    vi.doMock("@/lib/repositories/custom-foods", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/custom-foods")>("../lib/repositories/custom-foods");
      return { ...actual, listCustomFoods: vi.fn().mockResolvedValue([]) };
    });
    const { executeSearchFoods } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeSearchFoods({ query: "xyzxyzxyz-nao-existe" });
    expect(result.items).toEqual([]);
  });
});

describe("executeGetFoodDetails", () => {
  it("devolve os nutrientes por 100g de um alimento TACO real", async () => {
    const { executeGetFoodDetails } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeGetFoodDetails({ source: "TACO", refId: "3" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.descricao).toBe("Arroz, tipo 1, cozido");
    const energy = result.nutrientsPer100g.find((n) => n.code === "ENERGY_KCAL");
    expect(energy?.value).toBeCloseTo(128.2585, 2);
    const iron = result.nutrientsPer100g.find((n) => n.code === "IRON");
    expect(iron?.value).toBeCloseTo(0.0767, 3);
  });

  it("found:false para um refId TACO que nao existe — nunca inventa", async () => {
    const { executeGetFoodDetails } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeGetFoodDetails({ source: "TACO", refId: "9999999" });
    expect(result).toEqual({ found: false });
  });

  it("resolve um alimento CUSTOM via repositorio (mockado)", async () => {
    vi.doMock("@/lib/repositories/custom-foods", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/custom-foods")>("../lib/repositories/custom-foods");
      return {
        ...actual,
        getCustomFoodById: vi.fn().mockResolvedValue({
          id: "custom-1",
          name: "Barrinha proteica X",
          brand: null,
          source: "CUSTOM",
          portion_base_grams: 100,
          energy_kcal: 300,
          protein_g: 20,
          carbohydrate_g: 30,
          fat_g: 10,
          fiber_g: null,
          sodium_mg: null,
          calcium_mg: null,
          iron_mg: null,
          potassium_mg: null,
          vitamin_c_mg: null,
          notes: null,
          created_at: "now",
          updated_at: "now",
        }),
      };
    });
    const { executeGetFoodDetails } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeGetFoodDetails({ source: "CUSTOM", refId: "custom-1" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.descricao).toBe("Barrinha proteica X");
    const energy = result.nutrientsPer100g.find((n) => n.code === "ENERGY_KCAL");
    expect(energy?.value).toBe(300);
  });

  it("nunca resolve um refId CUSTOM como MANUFACTURER (fontes nao se confundem)", async () => {
    vi.doMock("@/lib/repositories/custom-foods", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/custom-foods")>("../lib/repositories/custom-foods");
      return {
        ...actual,
        getCustomFoodById: vi.fn().mockResolvedValue({
          id: "custom-1",
          name: "Barrinha proteica X",
          brand: null,
          source: "CUSTOM",
          portion_base_grams: 100,
          energy_kcal: 300,
          protein_g: 20,
          carbohydrate_g: 30,
          fat_g: 10,
          fiber_g: null,
          sodium_mg: null,
          calcium_mg: null,
          iron_mg: null,
          potassium_mg: null,
          vitamin_c_mg: null,
          notes: null,
          created_at: "now",
          updated_at: "now",
        }),
      };
    });
    const { executeGetFoodDetails } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeGetFoodDetails({ source: "MANUFACTURER", refId: "custom-1" });
    expect(result).toEqual({ found: false });
  });
});

describe("executeGetFoodPortions", () => {
  it("found:false quando o alimento nao existe", async () => {
    const { executeGetFoodPortions } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeGetFoodPortions({ source: "TACO", refId: "9999999" });
    expect(result).toEqual({ found: false });
  });

  it("devolve as medidas caseiras reais cadastradas (via repositorio mockado)", async () => {
    vi.doMock("@/lib/repositories/food-portions", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/food-portions")>("../lib/repositories/food-portions");
      return {
        ...actual,
        listFoodPortions: vi.fn().mockResolvedValue([
          { id: "portion-1", food_source: "TACO", food_ref_id: "3", description: "1 colher de servir", gram_equivalent: 90, source: "TBCA", source_version: null, confidence: "high", is_active: 1, created_at: "now" },
        ]),
      };
    });
    const { executeGetFoodPortions } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeGetFoodPortions({ source: "TACO", refId: "3" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.portions).toEqual([{ id: "portion-1", description: "1 colher de servir", gramEquivalent: 90, confidence: "high" }]);
  });

  it("nenhuma medida cadastrada devolve lista vazia, nunca inventa uma", async () => {
    vi.doMock("@/lib/repositories/food-portions", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/food-portions")>("../lib/repositories/food-portions");
      return { ...actual, listFoodPortions: vi.fn().mockResolvedValue([]) };
    });
    const { executeGetFoodPortions } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeGetFoodPortions({ source: "TACO", refId: "3" });
    expect(result.found && result.portions).toEqual([]);
  });
});

describe("executeCalculateFoodNutrients — motor determinístico, nunca a IA calculando de cabeca", () => {
  it("100g de arroz tipo 1 cozido — calorias e ferro batem com o motor real", async () => {
    vi.doMock("@/lib/repositories/food-portions", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/food-portions")>("../lib/repositories/food-portions");
      return { ...actual, getFoodPortionById: vi.fn().mockResolvedValue(null) };
    });
    const { executeCalculateFoodNutrients } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeCalculateFoodNutrients({ source: "TACO", refId: "3", quantity: 100, unit: "g" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.grams).toBe(100);
    expect(result.resolutionMethod).toBe("explicit_grams");
    expect(result.confidence).toBe("high");
    expect(result.nutrients.energyKcal).toBe(128);
    expect(result.nutrients.ironMg).toBeCloseTo(0.1, 1);
  });

  it("unidade generica sem medida cadastrada vira estimativa explicita (confidence baixa + warning), nunca apresentada como precisa", async () => {
    vi.doMock("@/lib/repositories/food-portions", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/food-portions")>("../lib/repositories/food-portions");
      return { ...actual, getFoodPortionById: vi.fn().mockResolvedValue(null) };
    });
    const { executeCalculateFoodNutrients } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeCalculateFoodNutrients({ source: "TACO", refId: "3", quantity: 1, unit: "colher" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.confidence).toBe("low");
    expect(result.warning).toBeTruthy();
  });

  it("usa a medida caseira especifica (portionId) quando informada, em vez da conversao generica", async () => {
    vi.doMock("@/lib/repositories/food-portions", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/food-portions")>("../lib/repositories/food-portions");
      return {
        ...actual,
        getFoodPortionById: vi.fn().mockResolvedValue({
          id: "portion-1",
          food_source: "TACO",
          food_ref_id: "3",
          description: "1 colher de servir",
          gram_equivalent: 90,
          source: "TBCA",
          source_version: null,
          confidence: "high",
          is_active: 1,
          created_at: "now",
        }),
      };
    });
    const { executeCalculateFoodNutrients } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeCalculateFoodNutrients({ source: "TACO", refId: "3", quantity: 1, unit: "colher", portionId: "portion-1" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.grams).toBe(90);
    expect(result.resolutionMethod).toBe("food_household_measure");
    expect(result.confidence).toBe("high");
  });

  it("ignora um portionId que pertence a outro alimento (nunca aplica medida de identidade errada)", async () => {
    vi.doMock("@/lib/repositories/food-portions", async () => {
      const actual = await vi.importActual<typeof import("../lib/repositories/food-portions")>("../lib/repositories/food-portions");
      return {
        ...actual,
        getFoodPortionById: vi.fn().mockResolvedValue({
          id: "portion-1",
          food_source: "TACO",
          food_ref_id: "999",
          description: "medida de outro alimento",
          gram_equivalent: 500,
          source: "TBCA",
          source_version: null,
          confidence: "high",
          is_active: 1,
          created_at: "now",
        }),
      };
    });
    const { executeCalculateFoodNutrients } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeCalculateFoodNutrients({ source: "TACO", refId: "3", quantity: 1, unit: "colher", portionId: "portion-1" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.resolutionMethod).not.toBe("food_household_measure");
    expect(result.grams).not.toBe(500);
  });

  it("found:false para alimento inexistente, nunca inventa numero", async () => {
    const { executeCalculateFoodNutrients } = await import("../lib/ai/agents/food/food-catalog-agent");
    const result = await executeCalculateFoodNutrients({ source: "TACO", refId: "9999999", quantity: 100 });
    expect(result).toEqual({ found: false });
  });
});
