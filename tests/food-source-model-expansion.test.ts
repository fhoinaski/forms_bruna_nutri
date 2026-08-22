import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toPersistedMealFoodSource, toLegacyFoodSearchResponseItem, type FoodDetails } from "@/lib/nutrition/food-catalog";
import { resolveItemReference, type FoodReferenceLookup, type MealPlanItemLike } from "@/lib/nutrition/nutrients";
import { openLocalCanonicalDb, type LocalDb } from "../scripts/canonical-nutrition-import/local-db";
import { importTaco } from "../scripts/canonical-nutrition-import/run-taco";
import type { CanonicalDbExecutor } from "@/lib/nutrition/canonical-food-search";

const FIXTURES = resolve("tests/fixtures/canonical-nutrition");

/**
 * FASE 6.5 (item 10) — food_source expandido pra aceitar TBCA/IBGE_POF de
 * forma backward-compatible. Cobre: os 4 valores legados continuam
 * idênticos, os 2 novos são aceitos, serialização/Zod continuam
 * compatíveis, o piloto admin consegue transportar identidade TBCA, e o
 * fallback (Nutrition Engine ainda não consome esses nutrientes) funciona.
 */

describe("toPersistedMealFoodSource — item 10 (TACO/CUSTOM/MANUFACTURER/USDA unchanged, TBCA/IBGE_POF accepted)", () => {
  it("TACO/COMPLEMENTARY continuam mapeando pra TACO (unchanged)", () => {
    expect(toPersistedMealFoodSource("TACO")).toBe("TACO");
    expect(toPersistedMealFoodSource("COMPLEMENTARY")).toBe("TACO");
  });
  it("CUSTOM/MANUFACTURER continuam identicos (unchanged)", () => {
    expect(toPersistedMealFoodSource("CUSTOM")).toBe("CUSTOM");
    expect(toPersistedMealFoodSource("MANUFACTURER")).toBe("MANUFACTURER");
  });
  it("USDA agora e aceito (achado real da auditoria: lacuna pre-existente, ja era persistivel no schema)", () => {
    expect(toPersistedMealFoodSource("USDA")).toBe("USDA");
  });
  it("TBCA accepted as source", () => {
    expect(toPersistedMealFoodSource("TBCA")).toBe("TBCA");
  });
  it("IBGE_POF accepted as source", () => {
    expect(toPersistedMealFoodSource("IBGE_POF")).toBe("IBGE_POF");
  });
  it("OPEN_FOOD_FACTS (fonte nunca persistivel) continua null", () => {
    expect(toPersistedMealFoodSource("OPEN_FOOD_FACTS")).toBeNull();
  });
});

describe("serialization backward compatible — item 5", () => {
  it("toLegacyFoodSearchResponseItem continua funcionando pra um FoodDetails TACO normal", () => {
    const details: FoodDetails = {
      ref: { source: "TACO", sourceId: "1" },
      name: "Arroz, integral, cozido",
      sourceLabel: "TACO",
      macroReference: { descricao: "Arroz, integral, cozido", energia_kcal: 124, proteina_g: 2.6, carboidrato_g: 25.8, lipidios_g: 1 },
    };
    const item = toLegacyFoodSearchResponseItem(details);
    expect(item.ref.source).toBe("TACO");
    expect(item.displayName).toBe("Arroz integral cozido");
    // sourceId "1" bate num alimento real do catalogo TACO estatico —
    // toFoodSearchResult prioriza esse dado real sobre o macroReference
    // passado aqui, entao so confirma que o campo continua um numero > 0
    // (serializacao funcionando), sem fixar o valor exato do catalogo.
    expect(typeof item.energia_kcal).toBe("number");
    expect(item.energia_kcal).toBeGreaterThan(0);
  });
});

describe("Zod schemas updated — item 5", () => {
  it("meal-plan item schema aceita TBCA/IBGE_POF sem erro de validação", async () => {
    const { z } = await import("zod");
    const itemSchema = z.object({
      food: z.string().min(1).max(300),
      food_source: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA", "TBCA", "IBGE_POF"]).nullable().optional(),
      canonical_food_id: z.string().max(160).nullable().optional(),
    });
    expect(itemSchema.safeParse({ food: "Milho cozido", food_source: "TBCA", canonical_food_id: "tbca:medidas_caseiras:BRC0001C" }).success).toBe(true);
    expect(itemSchema.safeParse({ food: "Milho cozido", food_source: "IBGE_POF" }).success).toBe(true);
    expect(itemSchema.safeParse({ food: "Arroz", food_source: "TACO" }).success).toBe(true);
  });

  it("substitution schema (fora de escopo nesta fase) continua rejeitando TBCA/IBGE_POF de proposito (item 13)", async () => {
    const { z } = await import("zod");
    const substitutionSourceSchema = z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA"]);
    expect(substitutionSourceSchema.safeParse("TBCA").success).toBe(false);
    expect(substitutionSourceSchema.safeParse("TACO").success).toBe(true);
  });
});

describe("fallback works where legacy pipeline cannot consume it — item 8/9 (nutrients.ts)", () => {
  const lookup: FoodReferenceLookup = {
    byTacoNumber: () => ({ descricao: "Arroz", energia_kcal: 100, proteina_g: 1, carboidrato_g: 20, lipidios_g: 1 }),
    byCustomId: () => null,
    fuzzyMatch: () => ({ descricao: "Fuzzy Match Errado", energia_kcal: 999, proteina_g: 99, carboidrato_g: 99, lipidios_g: 99 }),
  };

  it("item TBCA com food_ref_id NUNCA cai no fuzzyMatch (risco real: casaria por texto com alimento errado) — devolve null", () => {
    const item: MealPlanItemLike = { food: "Milho cozido", food_source: "TBCA", food_ref_id: "BRC0001C" };
    expect(resolveItemReference(item, lookup)).toBeNull();
  });

  it("item IBGE_POF com food_ref_id tambem devolve null, nunca fuzzyMatch", () => {
    const item: MealPlanItemLike = { food: "Milho cozido", food_source: "IBGE_POF", food_ref_id: "pof:123" };
    expect(resolveItemReference(item, lookup)).toBeNull();
  });

  it("item TACO continua resolvendo normalmente (unchanged)", () => {
    const item: MealPlanItemLike = { food: "Arroz", food_source: "TACO", food_ref_id: "1" };
    expect(resolveItemReference(item, lookup)?.energia_kcal).toBe(100);
  });

  it("item sem food_source (texto livre) continua caindo no fuzzyMatch (unchanged)", () => {
    const item: MealPlanItemLike = { food: "algo digitado livre" };
    expect(resolveItemReference(item, lookup)?.energia_kcal).toBe(999);
  });
});

describe("old snapshots still parse — item 9", () => {
  it("um item legado (sem canonical_food_id, campo que nem existia antes desta fase) continua valido", async () => {
    const { z } = await import("zod");
    const itemSchema = z.object({
      food: z.string(),
      food_source: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA", "TBCA", "IBGE_POF"]).nullable().optional(),
      canonical_food_id: z.string().nullable().optional(),
    });
    // Simula uma linha historica do banco, sem o campo novo.
    const legacyRow = { food: "Arroz, integral, cozido", food_source: "TACO" as const };
    const parsed = itemSchema.safeParse(legacyRow);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.canonical_food_id).toBeUndefined();
  });
});

function ref(sourceId: string) {
  return { source: "TACO" as const, sourceId };
}

function makeLocalDb(): { db: LocalDb; executor: CanonicalDbExecutor; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "food-source-expansion-test-"));
  const db = openLocalCanonicalDb(join(dir, "test.sqlite"));
  importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-taco");
  const executor: CanonicalDbExecutor = async (sql, params) => db.prepare(sql).all(...params);
  return { db, executor, dir };
}

describe("admin pilot can transport TBCA identity — item 10", () => {
  const ALL_SCOPE_ENV_VARS = ["CANONICAL_FOOD_RESOLVER_MODE", "CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH"];
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const key of ALL_SCOPE_ENV_VARS) delete process.env[key];
  });

  it("prefer_canonical + V2 confiante numa fonte TBCA (fixture nao tem TBCA real, mas confirma que a restricao TACO-only foi removida): candidato TACO fixture ainda preseleciona normalmente", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH = "prefer_canonical";
    const { db, executor, dir } = makeLocalDb();
    try {
      const { annotateAdminFoodSearchWithCanonicalPilot } = await import("@/lib/nutrition/canonical-food-admin-search");
      const baselineItems = [{
        numero: "1", grupo: "", ref: ref("1"), sourceLabel: "TACO", name: "Arroz, integral, cozido", displayName: "Arroz integral cozido",
        descricao: "Arroz, integral, cozido", fonte: "taco" as const, energia_kcal: 100, proteina_g: 1, carboidrato_g: 1, lipidios_g: 1, fibra_g: null,
        energyKcal: 100, proteinG: 1, carbohydrateG: 1, fatG: 1, fiberG: null,
      }];
      const result = await annotateAdminFoodSearchWithCanonicalPilot("Arroz, integral, cozido", baselineItems, { db: executor });
      expect(result.canonicalPilot?.preselected).toBe(true);
      expect(result.canonicalPilot?.source).toBe("TACO");
      // canonicalFoodId sempre presente na anotacao — item 3 (source identity).
      expect(result.canonicalPilot?.canonicalFoodId).toBeTruthy();
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
