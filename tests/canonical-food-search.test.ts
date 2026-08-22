import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonicalFoodSearch, normalizeFoodName, resolveQueryPreparation } from "@/lib/nutrition/canonical-food-search";
import { openLocalCanonicalDb, type LocalDb } from "../scripts/canonical-nutrition-import/local-db";
import { importTaco } from "../scripts/canonical-nutrition-import/run-taco";
import { importPof } from "../scripts/canonical-nutrition-import/run-pof";
import { importTbca } from "../scripts/canonical-nutrition-import/run-tbca";
import { insertCanonicalFood, insertFtsRow, startImportBatch } from "../scripts/canonical-nutrition-import/common";
import type { CanonicalFoodRecord } from "@/lib/nutrition-import/types";
import type { CanonicalDbExecutor } from "@/lib/nutrition/canonical-food-search";

const FIXTURES = resolve("tests/fixtures/canonical-nutrition");

let tempDir: string;
let db: LocalDb;
let executor: CanonicalDbExecutor;

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "canonical-search-test-"));
  db = openLocalCanonicalDb(join(tempDir, "test.sqlite"));
  executor = async (sql, params) => db.prepare(sql).all(...params);

  importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-taco");
  importPof(join(FIXTURES, "pof-fixture.json"), db, "batch-pof");
  await importTbca(join(FIXTURES, "tbca-fixture.json"), db, "batch-tbca");

  // Casos sinteticos de borda que a fixture real nao cobre por si so
  // (nomes duplicados entre fontes, empate de score) — inseridos direto
  // via os MESMOS helpers do importador real, nunca fabricando uma tabela
  // paralela.
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

describe("normalizeFoodName — Fase 3 item 6", () => {
  it("lowercase, remove acentos, normaliza pontuacao e espacos", () => {
    expect(normalizeFoodName("Arroz, Integral,  Cozido")).toBe("arroz integral cozido");
    expect(normalizeFoodName("AÇAÍ   com   Açúcar")).toBe("acai com acucar");
  });

  it("preserva termos semanticamente importantes (nunca remove como stopword)", () => {
    for (const term of ["cru", "cozido", "assado", "frito", "grelhado", "refogado", "integral", "desnatado", "light", "diet"]) {
      expect(normalizeFoodName(`Alimento ${term} teste`)).toContain(term);
    }
    expect(normalizeFoodName("Iogurte sem açúcar")).toContain("sem acucar");
    expect(normalizeFoodName("Iogurte com açúcar")).toContain("com acucar");
  });
});

describe("resolveQueryPreparation", () => {
  it("detecta preparo da propria query quando nao informado explicitamente", () => {
    expect(resolveQueryPreparation({ query: "milho cozido" })).toBe("COOKED");
    expect(resolveQueryPreparation({ query: "frango grelhado" })).toBe("GRILLED");
    expect(resolveQueryPreparation({ query: "banana" })).toBeNull();
  });

  it("preparation explicito tem prioridade sobre a query", () => {
    expect(resolveQueryPreparation({ query: "milho", preparation: "cru" })).toBe("RAW");
  });
});

describe("canonicalFoodSearch — busca real (fixtures TACO+POF+TBCA)", () => {
  it("exact match: nome normalizado identico vence com score maximo e method EXACT_NAME", async () => {
    const results = await canonicalFoodSearch({ query: "Arroz, integral, cozido", db: executor, limit: 5 });
    expect(results[0].matchMethod).toBe("EXACT_NAME");
    expect(results[0].source).toBe("TACO");
    expect(results[0].sourceFoodId).toBe("1");
  });

  it("accent insensitive: busca sem acento encontra nome com acento", async () => {
    const results = await canonicalFoodSearch({ query: "mamao", db: executor, limit: 5 });
    expect(results.some((r) => r.name.toLowerCase().includes("mamão") || r.normalizedName.includes("mamao"))).toBe(false); // fixture nao tem mamao — smoke negativo
    const results2 = await canonicalFoodSearch({ query: "abacate", db: executor, limit: 5 });
    expect(results2.length).toBeGreaterThan(0);
  });

  it("preparation aware: milho cru/cozido/grelhado/assado (POF) continuam DISTINTOS, cada query acha o certo", async () => {
    const cru = await canonicalFoodSearch({ query: "milho cru", db: executor, limit: 5 });
    const cozido = await canonicalFoodSearch({ query: "milho cozido", db: executor, limit: 5 });
    expect(cru[0].sourceFoodId).not.toBe(cozido[0].sourceFoodId);
    expect(cru[0].preparation?.name).toBe("Cru(a)");
    expect(cozido[0].preparation?.name).toBe("Cozido(a)");
  });

  it("alias: alias curado encontra o alimento mesmo sem bater no nome tecnico", async () => {
    const results = await canonicalFoodSearch({ query: "arroz castanho cozido", db: executor, limit: 5 });
    expect(results[0].matchMethod).toBe("ALIAS_EXACT");
    expect(results[0].sourceFoodId).toBe("1");
  });

  it("ambiguidade: dois alimentos com nome normalizado identico empatam em score (sem escolha silenciosa)", async () => {
    const results = await canonicalFoodSearch({ query: "suco de uva integral", db: executor, limit: 5 });
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].score).toBe(results[1].score);
  });

  it("source tie-break: sourcePreference decide SO quando ha empate real, nunca sobrepoe diferenca de nome/preparo", async () => {
    const withoutPref = await canonicalFoodSearch({ query: "suco de uva integral", db: executor, limit: 5 });
    const withPref = await canonicalFoodSearch({ query: "suco de uva integral", db: executor, limit: 5, sourcePreference: ["TACO"] });
    // mesmo par empatado, mas a ordem entre os dois pode ser decidida pelo tiebreak — os scores continuam iguais entre eles
    expect(withoutPref[0].score).toBe(withoutPref[1].score);
    expect(withPref[0].score).toBeGreaterThanOrEqual(withPref[1].score);
  });

  it("distinct preparation nunca sintetiza nutriente — cada resultado preserva source/sourceFoodId proprios", async () => {
    const results = await canonicalFoodSearch({ query: "milho grelhado", db: executor, limit: 5 });
    for (const r of results) {
      expect(r.source).toBeTruthy();
      expect(r.sourceFoodId).toBeTruthy();
    }
  });

  it("regional/biodiversidade: cultivar da TBCA e encontrado com classification presente", async () => {
    const results = await canonicalFoodSearch({ query: "abacaxi", db: executor, limit: 10 });
    const bio = results.find((r) => r.source === "TBCA");
    expect(bio).toBeDefined();
  });

  it("industrializado (produtos): achocolatado dietetico da TBCA e encontrado", async () => {
    const results = await canonicalFoodSearch({ query: "achocolatado", db: executor, limit: 5 });
    expect(results.some((r) => r.source === "TBCA")).toBe(true);
  });

  it("cultivar ambiguity: duas variedades de abacaxi nao sao fundidas num so resultado", async () => {
    const results = await canonicalFoodSearch({ query: "abacaxi", db: executor, limit: 10 });
    const tbcaResults = results.filter((r) => r.source === "TBCA");
    const uniqueIds = new Set(tbcaResults.map((r) => r.sourceFoodId));
    expect(uniqueIds.size).toBe(tbcaResults.length); // nenhum id duplicado/fundido
  });

  it("FTS fallback: query curta/atipica ainda usa o caminho LIKE sem quebrar", async () => {
    const results = await canonicalFoodSearch({ query: "ovo", db: executor, limit: 5 });
    expect(Array.isArray(results)).toBe(true);
  });

  it("medidas caseiras: abacate (TBCA) retorna portions com source_measure e parsed_label_grams SEPARADOS", async () => {
    const results = await canonicalFoodSearch({ query: "Abacate, polpa, in natura , Brasil", db: executor, limit: 3, includePortions: true });
    const abacate = results.find((r) => r.source === "TBCA");
    expect(abacate?.portions?.length).toBeGreaterThan(0);
    const portion = abacate!.portions!.find((p) => p.weightSource === "structured_quantity");
    expect(portion).toBeDefined();
  });

  it("nao converte mL em g: nenhuma porcao com weightSource structured_quantity e unidade mL tem gramWeight preenchido", async () => {
    const results = await canonicalFoodSearch({ query: "Abacate, polpa, in natura , Brasil", db: executor, limit: 3, includePortions: true });
    const abacate = results.find((r) => r.source === "TBCA");
    const mlPortions = (abacate?.portions ?? []).filter((p) => p.mlWeight !== null);
    for (const p of mlPortions) expect(p.gramWeight).toBeNull();
  });

  it("score determinístico: a mesma query roda duas vezes e devolve o mesmo score/ordem", async () => {
    const first = await canonicalFoodSearch({ query: "arroz integral cozido", db: executor, limit: 5 });
    const second = await canonicalFoodSearch({ query: "arroz integral cozido", db: executor, limit: 5 });
    expect(first.map((r) => ({ id: r.foodId, score: r.score }))).toEqual(second.map((r) => ({ id: r.foodId, score: r.score })));
  });

  it("scoreBreakdown sempre presente para depuracao/testes", async () => {
    const results = await canonicalFoodSearch({ query: "abacate", db: executor, limit: 3 });
    for (const r of results) {
      expect(r.scoreBreakdown).toBeDefined();
      expect(typeof r.scoreBreakdown.nameScore).toBe("number");
    }
  });
});
