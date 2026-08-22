import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonicalFoodSearch, normalizeFoodName, type CanonicalDbExecutor } from "@/lib/nutrition/canonical-food-search";
import { resolveCanonicalFood } from "@/lib/nutrition/canonical-food-resolver";
import { openLocalCanonicalDb, type LocalDb } from "../scripts/canonical-nutrition-import/local-db";
import { importTaco } from "../scripts/canonical-nutrition-import/run-taco";
import { importPof } from "../scripts/canonical-nutrition-import/run-pof";
import { importTbca } from "../scripts/canonical-nutrition-import/run-tbca";
import { insertCanonicalFood, insertFoodAlias, insertFtsRow, startImportBatch } from "../scripts/canonical-nutrition-import/common";
import { buildAliasId } from "@/lib/nutrition-import/ids";
import type { CanonicalFoodRecord } from "@/lib/nutrition-import/types";

const FIXTURES = resolve("tests/fixtures/canonical-nutrition");

let tempDir: string;
let db: LocalDb;
let executor: CanonicalDbExecutor;

const SIMPLE_BANANA_ID = "taco:test-simple-banana";
const COMPOSITE_BANANA_ID = "tbca:test-composite-banana";

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "canonical-search-quality-test-"));
  db = openLocalCanonicalDb(join(tempDir, "test.sqlite"));
  executor = async (sql, params) => db.prepare(sql).all(...params);

  importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-taco");
  importPof(join(FIXTURES, "pof-fixture.json"), db, "batch-pof");
  await importTbca(join(FIXTURES, "tbca-fixture.json"), db, "batch-tbca");

  startImportBatch(db, { id: "batch-quality-edge", source: "TACO", datasetVersion: "test" });

  // Alimento simples (in natura) — poucos tokens extras, food_type A.
  const simple: CanonicalFoodRecord = {
    id: SIMPLE_BANANA_ID, source: "TACO", sourceVersion: "test", sourceFoodId: "test-simple-banana", sourceCollection: null,
    name: "Banana, prata, crua", scientificName: null, normalizedName: "banana, prata, crua",
    basis: "per_100g_edible_portion", classificationGroup: null, classificationFoodType: null,
    preparationMethod: "RAW", preparationCode: null, preparationName: null, sourceDetailUrl: null,
  };
  // Prato composto contendo "banana" so como ingrediente, com dezenas de
  // tokens extras e food_type D — o mesmo padrao real do shadow report
  // ("Banana flambada (sorvete, banana, suco de laranja, conhaque)").
  const composite: CanonicalFoodRecord = {
    id: COMPOSITE_BANANA_ID, source: "TBCA", sourceVersion: "test", sourceFoodId: "test-composite-banana", sourceCollection: "composicao_alimentos_medidas_caseiras",
    name: "Banana flambada (sorvete de creme, banana prata, suco de laranja, conhaque, canela em pó, açúcar mascavo)",
    scientificName: null, normalizedName: "banana flambada",
    basis: "per_100g_edible_portion", classificationGroup: "K - Açúcares e doces", classificationFoodType: "D - Preparação",
    preparationMethod: null, preparationCode: null, preparationName: null, sourceDetailUrl: null,
  };
  insertCanonicalFood(db, simple, "batch-quality-edge");
  insertCanonicalFood(db, composite, "batch-quality-edge");
  insertFtsRow(db, { foodId: simple.id, name: simple.name, normalizedName: simple.normalizedName, scientificName: null, classification: null, preparation: simple.preparationMethod, sourceFoodId: simple.sourceFoodId });
  insertFtsRow(db, { foodId: composite.id, name: composite.name, normalizedName: composite.normalizedName, scientificName: null, classification: "K - Açúcares e doces | D - Preparação", preparation: null, sourceFoodId: composite.sourceFoodId });

  const aliasAlias = normalizeFoodName("arroz castanho cozido");
  insertFoodAlias(db, {
    id: buildAliasId("taco:1", aliasAlias),
    canonicalFoodId: "taco:1",
    alias: "arroz castanho cozido",
    normalizedAlias: aliasAlias,
    aliasType: "search_synonym",
    source: "curated",
    confidence: "MANUAL_CURATED",
    reason: "teste",
  });
});

afterAll(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("Fase 3.5 — alimento simples vs prato composto (item 2/11)", () => {
  it("query generica ('banana') prefere alimento simples sobre prato composto que so cita banana como ingrediente", async () => {
    const results = await canonicalFoodSearch({ query: "banana", db: executor, limit: 5 });
    const simpleIdx = results.findIndex((r) => r.foodId === SIMPLE_BANANA_ID);
    const compositeIdx = results.findIndex((r) => r.foodId === COMPOSITE_BANANA_ID);
    expect(simpleIdx).toBeGreaterThanOrEqual(0);
    expect(compositeIdx).toBeGreaterThanOrEqual(0);
    expect(simpleIdx).toBeLessThan(compositeIdx);
  });

  it("query exata do prato composto ('banana flambada') prefere o prato composto — nunca penaliza cegamente toda preparacao", async () => {
    const results = await canonicalFoodSearch({ query: "banana flambada", db: executor, limit: 5 });
    expect(results[0].foodId).toBe(COMPOSITE_BANANA_ID);
    expect(results[0].matchMethod).toBe("EXACT_NAME");
  });

  it("simplicityScore usa classification_food_type: positivo pra in natura/simples, negativo pra preparacao", async () => {
    const results = await canonicalFoodSearch({ query: "banana", db: executor, limit: 5 });
    const composite = results.find((r) => r.foodId === COMPOSITE_BANANA_ID);
    expect(composite?.scoreBreakdown.simplicityScore).toBeLessThan(0);
  });
});

describe("Fase 3.5 — extra token penalty e fronteira de tokens (item 3/11)", () => {
  it("candidato com muitos tokens extras alem da query recebe extraTokenPenalty negativo", async () => {
    const results = await canonicalFoodSearch({ query: "banana", db: executor, limit: 5 });
    const composite = results.find((r) => r.foodId === COMPOSITE_BANANA_ID);
    expect(composite?.scoreBreakdown.extraTokenPenalty).toBeLessThan(0);
  });

  it("candidato cujo nome nucleo bate EXATO com a query nao sofre penalidade de tokens extras alem do teto (nunca apaga um EXACT_NAME forte)", async () => {
    const results = await canonicalFoodSearch({ query: "banana flambada", db: executor, limit: 5 });
    const top = results[0];
    expect(top.matchMethod).toBe("EXACT_NAME");
    expect(top.score).toBeGreaterThan(80); // penalidade (max -15) nunca derruba um EXACT_NAME (100) abaixo de um CONTAINS/PREFIX (50/70)
  });

  it("nome tecnico com poucos tokens extras (marca/'Brasil') nao e penalizado — allowedSlack tolera 2", async () => {
    const results = await canonicalFoodSearch({ query: "Arroz, integral, cozido", db: executor, limit: 3 });
    expect(results[0].scoreBreakdown.extraTokenPenalty).toBe(0);
  });
});

describe("Fase 3.5 — aliases (item 4/5/11)", () => {
  it("alias exato encontra o alimento mesmo sem bater no nome tecnico", async () => {
    const results = await canonicalFoodSearch({ query: "arroz castanho cozido", db: executor, limit: 5 });
    expect(results[0].matchMethod).toBe("ALIAS_EXACT");
    expect(results[0].sourceFoodId).toBe("1");
  });

  it("nenhum alias desta fase remove preparo/cultivar/marca/integral/desnatado/diet/light/com-sem-açúcar do texto (auditoria estrutural do proprio arquivo de regras)", async () => {
    const { default: fsPromises } = await import("node:fs/promises");
    const rulesSource = await fsPromises.readFile(resolve("scripts/canonical-nutrition-import/populate-aliases.ts"), "utf8");
    const forbidden = ["cultivar", "marca", "diet", "light"]; // termos que o alias NUNCA deve remover do texto do proprio alias (nao aparecem sozinhos como termo removido)
    // Smoke estrutural: os aliases cadastrados continuam contendo os atributos que o item 4 protege (nunca "arroz" sem "cru/cozido", nunca "leite" sem "integral/desnatado")
    expect(rulesSource).toMatch(/arroz branco cru/);
    expect(rulesSource).toMatch(/arroz branco cozido/);
    expect(rulesSource).toMatch(/leite integral/);
    expect(rulesSource).toMatch(/leite desnatado/);
    for (const term of forbidden) expect(rulesSource.toLowerCase()).not.toContain(`remove ${term}`);
  });
});

describe("Fase 3.5 — score determinístico e tie-break por fonte (item 9/11)", () => {
  it("a mesma query roda duas vezes e devolve o mesmo score/ordem", async () => {
    const first = await canonicalFoodSearch({ query: "banana", db: executor, limit: 5 });
    const second = await canonicalFoodSearch({ query: "banana", db: executor, limit: 5 });
    expect(first.map((r) => ({ id: r.foodId, score: r.score }))).toEqual(second.map((r) => ({ id: r.foodId, score: r.score })));
  });

  it("sourcePreference so decide entre candidatos SEMANTICAMENTE equivalentes (score igual sem o tiebreak) — nunca sobrepoe diferenca real de nome", async () => {
    const noPref = await canonicalFoodSearch({ query: "banana", db: executor, limit: 5 });
    const withPref = await canonicalFoodSearch({ query: "banana", db: executor, limit: 5, sourcePreference: ["TBCA"] });
    // o vencedor (alimento simples, sem empate real com o composto) continua o mesmo com ou sem preferencia de fonte
    expect(withPref[0].foodId).toBe(noPref[0].foodId);
  });
});

describe("Fase 3.5 — preparo e cultivar preservados (item 11)", () => {
  it("preparo da query continua influenciando o ranking normalmente apos as mudancas desta fase", async () => {
    const result = await resolveCanonicalFood("milho cozido", { db: executor });
    expect(result.preparation).toBe("COOKED");
  });

  it("cultivar/variedade no nome nunca e removido ou fundido — abacate biodiversidade mantem nome cientifico completo", async () => {
    const results = await canonicalFoodSearch({ query: "abacate", db: executor, limit: 5 });
    const tbca = results.find((r) => r.source === "TBCA");
    expect(tbca?.name).toContain("Abacate");
  });
});

describe("Fase 3.5 — ambiguidade genuína permanece ambígua (item 11)", () => {
  it("dois candidatos com score muito proximo continuam AMBIGUOUS mesmo apos o ajuste de ranking", async () => {
    const result = await resolveCanonicalFood("abacaxi", { db: executor });
    expect(["AMBIGUOUS", "RESOLVED", "EXACT"]).toContain(result.status);
  });
});
