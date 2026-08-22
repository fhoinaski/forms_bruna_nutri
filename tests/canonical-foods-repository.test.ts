import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getById, getNutrients, getPortions, search } from "@/lib/repositories/canonical-foods";
import { openLocalCanonicalDb, type LocalDb } from "../scripts/canonical-nutrition-import/local-db";
import { importTaco } from "../scripts/canonical-nutrition-import/run-taco";
import { importTbca } from "../scripts/canonical-nutrition-import/run-tbca";
import type { CanonicalDbExecutor } from "@/lib/nutrition/canonical-food-search";

const FIXTURES = resolve("tests/fixtures/canonical-nutrition");

let tempDir: string;
let db: LocalDb;
let executor: CanonicalDbExecutor;

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "canonical-foods-repo-test-"));
  db = openLocalCanonicalDb(join(tempDir, "test.sqlite"));
  executor = async (sql, params) => db.prepare(sql).all(...params);
  importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-taco");
  await importTbca(join(FIXTURES, "tbca-fixture.json"), db, "batch-tbca");
});

afterAll(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("CanonicalFoodRepository — Fase 4 item 3 (compatível SQLite local / D1)", () => {
  it("search() delega pra canonicalFoodSearch sem duplicar logica", async () => {
    const results = await search({ query: "Arroz, integral, cozido", db: executor, limit: 3 });
    expect(results[0].sourceFoodId).toBe("1");
  });

  it("getById() retorna um alimento canonico por id", async () => {
    const food = await getById("taco:1", executor);
    expect(food?.name).toBe("Arroz, integral, cozido");
    expect(food?.source).toBe("TACO");
  });

  it("getById() retorna null pra id inexistente — nunca lanca", async () => {
    const food = await getById("taco:does-not-exist", executor);
    expect(food).toBeNull();
  });

  it("getPortions() preserva source_measure_quantity/unit e parsed_label_grams separados (item 10) — nunca converte mL em g", async () => {
    const abacate = await search({ query: "Abacate, polpa, in natura", db: executor, limit: 1 });
    const foodId = abacate[0]?.foodId;
    expect(foodId).toBeDefined();
    const portions = await getPortions(foodId!, executor);
    expect(portions.length).toBeGreaterThan(0);
    for (const p of portions) {
      if (p.mlWeight !== null) expect(p.gramWeight).toBeNull();
    }
  });

  it("getNutrients()/getCanonicalFoodNutrition() preserva trace/missing e nunca combina fontes (item 11)", async () => {
    const arroz = await getById("taco:1", executor);
    expect(arroz).not.toBeNull();
    const nutrients = await getNutrients("taco:1", executor);
    expect(nutrients.length).toBeGreaterThan(0);
    for (const n of nutrients) {
      expect(n.source).toBe("TACO"); // um foodId so tem nutrientes da PROPRIA fonte
      expect(["reported", "trace", "missing", "not_applicable", "unparsed"]).toContain(n.status);
    }
    const missing = nutrients.filter((n) => n.status === "missing");
    for (const m of missing) expect(m.value).toBeNull(); // missing nunca tem valor escondido
  });
});
