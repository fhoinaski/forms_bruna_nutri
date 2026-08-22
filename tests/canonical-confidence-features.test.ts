import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonicalFoodSearch, resolveQueryPreparation, type CanonicalDbExecutor } from "@/lib/nutrition/canonical-food-search";
import { extractConfidenceFeatures, classifyQueryRisk } from "@/lib/nutrition/canonical-confidence-features";
import { openLocalCanonicalDb, type LocalDb } from "../scripts/canonical-nutrition-import/local-db";
import { importTaco } from "../scripts/canonical-nutrition-import/run-taco";
import { importPof } from "../scripts/canonical-nutrition-import/run-pof";
import { importTbca } from "../scripts/canonical-nutrition-import/run-tbca";
import { insertCanonicalFood, insertFtsRow, startImportBatch } from "../scripts/canonical-nutrition-import/common";
import type { CanonicalFoodRecord } from "@/lib/nutrition-import/types";

const FIXTURES = resolve("tests/fixtures/canonical-nutrition");

let tempDir: string;
let db: LocalDb;
let executor: CanonicalDbExecutor;

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "canonical-confidence-test-"));
  db = openLocalCanonicalDb(join(tempDir, "test.sqlite"));
  executor = async (sql, params) => db.prepare(sql).all(...params);
  importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-taco");
  importPof(join(FIXTURES, "pof-fixture.json"), db, "batch-pof");
  await importTbca(join(FIXTURES, "tbca-fixture.json"), db, "batch-tbca");

  // Mesmos casos sinteticos de borda de tests/canonical-food-search.test.ts
  // (duplicata empatada entre fontes + alias curado) — precisam existir
  // aqui tambem pra testar numberOfCloseCandidates/matchClass EXACT_ALIAS
  // sobre dados reais, nao fabricados so pra este arquivo.
  startImportBatch(db, { id: "batch-edge", source: "TACO", datasetVersion: "test" });
  const duplicateA: CanonicalFoodRecord = {
    id: "taco:9001", source: "TACO", sourceVersion: "test", sourceFoodId: "9001", sourceCollection: null,
    name: "Suco de uva integral", scientificName: null, normalizedName: "suco de uva integral",
    basis: "per_100g_edible_portion", classificationGroup: null, classificationFoodType: null,
    preparationMethod: null, preparationCode: null, preparationName: null, sourceDetailUrl: null,
  };
  const duplicateB: CanonicalFoodRecord = { ...duplicateA, id: "taco:9002", sourceFoodId: "9002" };
  insertCanonicalFood(db, duplicateA, "batch-edge");
  insertCanonicalFood(db, duplicateB, "batch-edge");
  insertFtsRow(db, { foodId: duplicateA.id, name: duplicateA.name, normalizedName: duplicateA.normalizedName, scientificName: null, classification: null, preparation: null, sourceFoodId: duplicateA.sourceFoodId });
  insertFtsRow(db, { foodId: duplicateB.id, name: duplicateB.name, normalizedName: duplicateB.normalizedName, scientificName: null, classification: null, preparation: null, sourceFoodId: duplicateB.sourceFoodId });

  db.prepare(
    `INSERT INTO food_aliases (id, canonical_food_id, alias, normalized_alias, alias_type, source, created_at)
     VALUES ('alias-1', 'taco:1', 'arroz castanho cozido', 'arroz castanho cozido', 'regional', 'curated', CURRENT_TIMESTAMP)`
  ).run();
});

afterAll(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

/**
 * FASE 5.5 (item 14) — extractConfidenceFeatures/classifyQueryRisk contra
 * dados REAIS de fixture (mesma base ja usada por
 * tests/canonical-food-search.test.ts), nunca dados sinteticos — garante
 * que os sinais fazem sentido sobre resultados de ranking de verdade.
 */
describe("extractConfidenceFeatures — Fase 5.5 (item 14, integracao)", () => {
  it("preparo estruturado da POF (milho cozido) vira STRUCTURED_EXACT/TEXT_EXACT, nunca NONE", async () => {
    const results = await canonicalFoodSearch({ query: "milho cozido", db: executor, limit: 8 });
    const prep = resolveQueryPreparation({ query: "milho cozido" });
    const features = extractConfidenceFeatures("milho cozido", results, prep);
    expect(features).not.toBeNull();
    expect(["STRUCTURED_EXACT", "TEXT_EXACT"]).toContain(features!.preparationEvidence);
    expect(features!.preparationExact).toBe(true);
  });

  it("query sem preparo pedido → preparationEvidence NONE", async () => {
    const results = await canonicalFoodSearch({ query: "abacate", db: executor, limit: 8 });
    const prep = resolveQueryPreparation({ query: "abacate" });
    const features = extractConfidenceFeatures("abacate", results, prep);
    expect(features!.preparationEvidence).toBe("NONE");
  });

  it("ambiguidade real de score empatado (suco de uva integral, 2 fontes) gera numberOfCloseCandidates > 0", async () => {
    const results = await canonicalFoodSearch({ query: "suco de uva integral", db: executor, limit: 8 });
    const prep = resolveQueryPreparation({ query: "suco de uva integral" });
    const features = extractConfidenceFeatures("suco de uva integral", results, prep);
    expect(features!.numberOfCloseCandidates).toBeGreaterThan(0);
    expect(features!.gapToSecond).toBe(0);
  });

  it("classifyQueryRisk marca HIGH_RISK quando ha candidatos proximos empatados", async () => {
    const results = await canonicalFoodSearch({ query: "suco de uva integral", db: executor, limit: 8 });
    const prep = resolveQueryPreparation({ query: "suco de uva integral" });
    const features = extractConfidenceFeatures("suco de uva integral", results, prep)!;
    expect(classifyQueryRisk(features)).toBe("HIGH_RISK");
  });

  it("alias curado (arroz castanho cozido) vira matchClass EXACT_ALIAS", async () => {
    const results = await canonicalFoodSearch({ query: "arroz castanho cozido", db: executor, limit: 8 });
    const prep = resolveQueryPreparation({ query: "arroz castanho cozido" });
    const features = extractConfidenceFeatures("arroz castanho cozido", results, prep)!;
    expect(features.matchClass).toBe("EXACT_ALIAS");
    expect(features.aliasExact).toBe(true);
  });

  it("query de 1 token (abacaxi) vira GENERIC_SHORT_QUERY", async () => {
    const results = await canonicalFoodSearch({ query: "abacaxi", db: executor, limit: 8 });
    const prep = resolveQueryPreparation({ query: "abacaxi" });
    const features = extractConfidenceFeatures("abacaxi", results, prep)!;
    expect(features.matchClass).toBe("GENERIC_SHORT_QUERY");
  });

  it("features sempre presentes (score/gap/matchClass/queryRisk) pra qualquer busca com resultado", async () => {
    const results = await canonicalFoodSearch({ query: "milho grelhado", db: executor, limit: 8 });
    const prep = resolveQueryPreparation({ query: "milho grelhado" });
    const features = extractConfidenceFeatures("milho grelhado", results, prep);
    expect(features).not.toBeNull();
    expect(typeof features!.totalScore).toBe("number");
    expect(["LOW_RISK", "MEDIUM_RISK", "HIGH_RISK"]).toContain(classifyQueryRisk(features!));
  });

  it("busca sem nenhum resultado → extractConfidenceFeatures devolve null (nunca inventa features)", async () => {
    const results = await canonicalFoodSearch({ query: "xyz_alimento_totalmente_inexistente_999", db: executor, limit: 8 });
    const prep = resolveQueryPreparation({ query: "xyz_alimento_totalmente_inexistente_999" });
    const features = extractConfidenceFeatures("xyz_alimento_totalmente_inexistente_999", results, prep);
    expect(features).toBeNull();
  });
});
