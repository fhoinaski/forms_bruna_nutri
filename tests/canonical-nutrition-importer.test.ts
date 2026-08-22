import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openLocalCanonicalDb, type LocalDb } from "../scripts/canonical-nutrition-import/local-db";
import { importTaco } from "../scripts/canonical-nutrition-import/run-taco";
import { importPof } from "../scripts/canonical-nutrition-import/run-pof";
import { importTbca } from "../scripts/canonical-nutrition-import/run-tbca";
import { insertCanonicalFood, startImportBatch } from "../scripts/canonical-nutrition-import/common";
import type { CanonicalFoodRecord } from "@/lib/nutrition-import/types";

const FIXTURES = resolve("tests/fixtures/canonical-nutrition");

let tempDir: string;
let dbPath: string;
let db: LocalDb;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "canonical-nutrition-test-"));
  dbPath = join(tempDir, "test.sqlite");
  db = openLocalCanonicalDb(dbPath);
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

function rows(sql: string, ...params: unknown[]): Record<string, unknown>[] {
  return db.prepare(sql).all(...params);
}
function one(sql: string, ...params: unknown[]): Record<string, unknown> | undefined {
  return db.prepare(sql).get(...params);
}

describe("TACO importer (fixture real, extraida de taco.json)", () => {
  it("importa os alimentos e preserva trace/missing sem virar zero/ausencia silenciosa", () => {
    const result = importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-taco-1");
    expect(result.counters.foodsCreated).toBe(result.totalFoods);
    expect(result.totalFoods).toBeGreaterThan(0);

    const missingRows = rows(`SELECT * FROM food_nutrient_values WHERE status = 'missing'`);
    for (const row of missingRows) {
      expect(row.value).toBeNull(); // missing nunca tem valor numerico "escondido"
    }

    const traceRows = rows(`SELECT * FROM food_nutrient_values WHERE status = 'trace'`);
    expect(traceRows.length).toBeGreaterThan(0);
    // trace pode ter value numerico (inclusive 0) OU null — o que importa e o STATUS nunca virar 'reported'
    for (const row of traceRows) {
      expect(row.status).toBe("trace");
    }
  });

  it("nutrientes sem NutrientCode (ex.: aminoacidos) sao inseridos com nutrient_code NULL, nunca descartados", () => {
    importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-taco-2");
    const unmapped = rows(`SELECT * FROM food_nutrient_values WHERE nutrient_code IS NULL`);
    expect(unmapped.length).toBeGreaterThan(0);
    // toda linha unmapped ainda preserva o source_nutrient_id original
    for (const row of unmapped) {
      expect(row.source_nutrient_id).toMatch(/^taco:/);
    }
  });

  it("idempotencia: rodar duas vezes sobre o mesmo arquivo nao duplica nada", () => {
    const first = importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-taco-a");
    const totalAfterFirst = one(`SELECT COUNT(*) AS n FROM food_nutrient_values`)?.n;
    const foodsAfterFirst = one(`SELECT COUNT(*) AS n FROM canonical_foods`)?.n;

    const second = importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-taco-b");
    const totalAfterSecond = one(`SELECT COUNT(*) AS n FROM food_nutrient_values`)?.n;
    const foodsAfterSecond = one(`SELECT COUNT(*) AS n FROM canonical_foods`)?.n;

    expect(second.counters.foodsCreated).toBe(0);
    expect(second.counters.foodsNoop).toBe(first.counters.foodsCreated);
    expect(totalAfterSecond).toBe(totalAfterFirst);
    expect(foodsAfterSecond).toBe(foodsAfterFirst);
  });

  it("retomada segura: uma 'rodada parcial' anterior (alguns foods ja inseridos) nao impede nem duplica a rodada completa", () => {
    // Simula um processo que morreu no meio: insere so o primeiro alimento
    // manualmente antes de rodar o importador completo.
    const partial: CanonicalFoodRecord = {
      id: "taco:1",
      source: "TACO",
      sourceVersion: "4ª edição revisada e ampliada (2011)",
      sourceFoodId: "1",
      sourceCollection: null,
      name: "Arroz, integral, cozido",
      scientificName: null,
      normalizedName: "arroz, integral, cozido",
      basis: "per_100g_edible_portion",
      classificationGroup: null,
      classificationFoodType: null,
      preparationMethod: "COOKED",
      preparationCode: null,
      preparationName: null,
      sourceDetailUrl: null,
    };
    startImportBatch(db, { id: "batch-partial", source: "TACO", datasetVersion: "test" });
    insertCanonicalFood(db, partial, "batch-partial");

    const result = importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-resume");
    const totalFoods = one(`SELECT COUNT(*) AS n FROM canonical_foods`)?.n;
    expect(totalFoods).toBe(result.totalFoods); // nao duplicou o alimento pre-inserido
    expect(result.counters.foodsNoop).toBeGreaterThanOrEqual(1); // o pre-inserido foi reconhecido como ja existente
  });
});

describe("POF importer (fixture real — milho em 4 preparacoes distintas)", () => {
  it("Fase 8: mesma comida em preparacoes diferentes vira registros DISTINTOS, nunca fundidos", () => {
    const result = importPof(join(FIXTURES, "pof-fixture.json"), db, "batch-pof-1");
    const milhoFoods = rows(`SELECT * FROM canonical_foods WHERE source_food_id LIKE '6300701:%'`);
    expect(milhoFoods.length).toBe(4); // cru, cozido, grelhado, assado
    const ids = new Set(milhoFoods.map((f) => f.id));
    expect(ids.size).toBe(4); // todos com id canonico proprio, nenhum colidiu
    expect(result.counters.foodsCreated).toBe(result.totalFoods);
  });

  it("preparation.code/name da fonte sao preservados por registro", () => {
    importPof(join(FIXTURES, "pof-fixture.json"), db, "batch-pof-2");
    const cru = one(`SELECT * FROM canonical_foods WHERE source_food_id = '6300701:1'`);
    expect(cru?.preparation_code).toBe("1");
    expect(cru?.preparation_name).toBe("Cru(a)");
    const cozido = one(`SELECT * FROM canonical_foods WHERE source_food_id = '6300701:2'`);
    expect(cozido?.preparation_name).toBe("Cozido(a)");
  });
});

describe("TBCA importer (fixture real extraida via streaming de tbca_completa.json)", () => {
  it("importa a colecao principal com medidas caseiras e nutrientes por porcao", async () => {
    const result = await importTbca(join(FIXTURES, "tbca-fixture.json"), db, "batch-tbca-1");
    expect(result.collectionCounts.composicao_alimentos_medidas_caseiras).toBeGreaterThan(0);
    expect(result.counters.portionsCreated).toBeGreaterThan(0);

    const portionRows = rows(`SELECT * FROM food_nutrient_values WHERE portion_id IS NOT NULL`);
    expect(portionRows.length).toBeGreaterThan(0);
  });

  it("composicao_informacao_estatistica enriquece o food da colecao principal via nutrient_statistics, NUNCA cria um segundo food", async () => {
    await importTbca(join(FIXTURES, "tbca-fixture.json"), db, "batch-tbca-2");
    // BRC0001C e BRC0001D vieram na fixture tanto na principal quanto na estatistica
    const mainFoods = rows(
      `SELECT * FROM canonical_foods WHERE source = 'TBCA' AND source_collection = 'composicao_alimentos_medidas_caseiras' AND source_food_id IN ('BRC0001C','BRC0001D')`
    );
    expect(mainFoods.length).toBe(2);
    for (const food of mainFoods) {
      const stats = rows(`SELECT * FROM nutrient_statistics WHERE canonical_food_id = ?`, food.id);
      expect(stats.length).toBeGreaterThan(0);
    }
    // nenhum canonical_food com source_collection='composicao_informacao_estatistica' deveria existir — so enriquece, nunca cria
    const statsAsFoods = rows(`SELECT * FROM canonical_foods WHERE source_collection = 'composicao_informacao_estatistica'`);
    expect(statsAsFoods.length).toBe(0);
  });

  it("produtos e biodiversidade viram CanonicalFood proprios (colecoes disjuntas, nunca fundidas com a principal)", async () => {
    await importTbca(join(FIXTURES, "tbca-fixture.json"), db, "batch-tbca-3");
    const products = rows(`SELECT * FROM canonical_foods WHERE source_collection = 'composicao_informacao_estatistica_produtos'`);
    const bio = rows(`SELECT * FROM canonical_foods WHERE source_collection = 'biodiversidade_e_alimentos_regionais'`);
    expect(products.length).toBeGreaterThan(0);
    expect(bio.length).toBeGreaterThan(0);
    // produtos tambem gera valores "reported" utilizaveis, nao so estatistica
    for (const food of products) {
      const values = rows(`SELECT * FROM food_nutrient_values WHERE canonical_food_id = ?`, food.id);
      expect(values.length).toBeGreaterThan(0);
    }
  });

  it("idempotencia: reimportar a mesma fixture TBCA nao duplica foods/nutrientes/porcoes/estatisticas", async () => {
    const first = await importTbca(join(FIXTURES, "tbca-fixture.json"), db, "batch-tbca-a");
    const totals1 = {
      foods: one(`SELECT COUNT(*) AS n FROM canonical_foods`)?.n,
      values: one(`SELECT COUNT(*) AS n FROM food_nutrient_values`)?.n,
      portions: one(`SELECT COUNT(*) AS n FROM canonical_food_portions`)?.n,
      stats: one(`SELECT COUNT(*) AS n FROM nutrient_statistics`)?.n,
    };
    const second = await importTbca(join(FIXTURES, "tbca-fixture.json"), db, "batch-tbca-b");
    const totals2 = {
      foods: one(`SELECT COUNT(*) AS n FROM canonical_foods`)?.n,
      values: one(`SELECT COUNT(*) AS n FROM food_nutrient_values`)?.n,
      portions: one(`SELECT COUNT(*) AS n FROM canonical_food_portions`)?.n,
      stats: one(`SELECT COUNT(*) AS n FROM nutrient_statistics`)?.n,
    };
    expect(totals2).toEqual(totals1);
    expect(second.counters.foodsCreated).toBe(0);
    expect(first.counters.foodsCreated).toBeGreaterThan(0);
  });
});

describe("Fase 9 — nunca fundir alimentos entre fontes", () => {
  it("um 'arroz' da TACO e um 'arroz' da POF nunca compartilham canonical_food_id nem se sobrescrevem", () => {
    importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-cross-taco");
    importPof(join(FIXTURES, "pof-fixture.json"), db, "batch-cross-pof");

    const tacoArroz = rows(`SELECT * FROM canonical_foods WHERE source = 'TACO' AND normalized_name LIKE '%arroz%'`);
    const pofArroz = rows(`SELECT * FROM canonical_foods WHERE source = 'IBGE_POF' AND normalized_name LIKE '%arroz%'`);
    expect(tacoArroz.length).toBeGreaterThan(0);
    expect(pofArroz.length).toBeGreaterThan(0);
    const tacoIds = new Set(tacoArroz.map((f) => f.id));
    const pofIds = new Set(pofArroz.map((f) => f.id));
    for (const id of tacoIds) expect(pofIds.has(id)).toBe(false);

    // nenhuma linha de food_nutrient_values de uma fonte aponta pra canonical_food de outra fonte
    const crossed = rows(
      `SELECT v.* FROM food_nutrient_values v JOIN canonical_foods f ON f.id = v.canonical_food_id WHERE v.source != f.source`
    );
    expect(crossed.length).toBe(0);
  });

  it("nao existe logica de merge/media entre fontes — food_match_candidates so pode ser preenchido como sugestao, nunca aplicado automaticamente pelos importadores", () => {
    importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-nomerge-taco");
    importPof(join(FIXTURES, "pof-fixture.json"), db, "batch-nomerge-pof");
    const candidates = rows(`SELECT * FROM food_match_candidates`);
    expect(candidates.length).toBe(0); // nenhum importador desta fase escreve nessa tabela
  });
});

describe("Fase 14 #11 — duplicate source ID nunca cria uma segunda linha", () => {
  it("inserir o mesmo (source, source_food_id, source_collection) duas vezes e um NOOP na segunda", () => {
    const record: CanonicalFoodRecord = {
      id: "taco:999",
      source: "TACO",
      sourceVersion: "4ª edição revisada e ampliada (2011)",
      sourceFoodId: "999",
      sourceCollection: null,
      name: "Alimento de teste",
      scientificName: null,
      normalizedName: "alimento de teste",
      basis: "per_100g_edible_portion",
      classificationGroup: null,
      classificationFoodType: null,
      preparationMethod: null,
      preparationCode: null,
      preparationName: null,
      sourceDetailUrl: null,
    };
    startImportBatch(db, { id: "batch-dup-1", source: "TACO", datasetVersion: "test" });
    startImportBatch(db, { id: "batch-dup-2", source: "TACO", datasetVersion: "test" });
    const firstInsert = insertCanonicalFood(db, record, "batch-dup-1");
    const secondInsert = insertCanonicalFood(db, record, "batch-dup-2");
    expect(firstInsert).toBe(true);
    expect(secondInsert).toBe(false);
    const total = one(`SELECT COUNT(*) AS n FROM canonical_foods WHERE source_food_id = '999'`)?.n;
    expect(total).toBe(1);
  });
});
