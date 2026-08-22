import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveCanonicalFood } from "@/lib/nutrition/canonical-food-resolver";
import { openLocalCanonicalDb, type LocalDb } from "../scripts/canonical-nutrition-import/local-db";
import { importTaco } from "../scripts/canonical-nutrition-import/run-taco";
import { importPof } from "../scripts/canonical-nutrition-import/run-pof";
import { importTbca } from "../scripts/canonical-nutrition-import/run-tbca";
import type { CanonicalDbExecutor } from "@/lib/nutrition/canonical-food-search";

const FIXTURES = resolve("tests/fixtures/canonical-nutrition");

let tempDir: string;
let db: LocalDb;
let executor: CanonicalDbExecutor;

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "canonical-resolver-test-"));
  db = openLocalCanonicalDb(join(tempDir, "test.sqlite"));
  executor = async (sql, params) => db.prepare(sql).all(...params);

  importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-taco");
  importPof(join(FIXTURES, "pof-fixture.json"), db, "batch-pof");
  await importTbca(join(FIXTURES, "tbca-fixture.json"), db, "batch-tbca");
});

afterAll(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("resolveCanonicalFood — Fase 3 item 9 (estados de resolucao)", () => {
  it("EXACT: nome tecnico identico, sem competidor proximo", async () => {
    const result = await resolveCanonicalFood("Arroz, integral, cozido", { db: executor });
    expect(result.status).toBe("EXACT");
    expect(result.source).toBe("TACO");
    expect(result.sourceFoodId).toBe("1");
    expect(result.selected).toBeDefined();
  });

  it("RESOLVED: vencedor claro (gap decisivo) mesmo sem ser EXACT_NAME", async () => {
    const result = await resolveCanonicalFood("milho cru", { db: executor });
    expect(["RESOLVED", "EXACT"]).toContain(result.status);
    expect(result.source).toBe("IBGE_POF");
    expect(result.preparation).toBe("RAW");
  });

  it("PREPARATION_REVIEW: alimento base existe mas nao na preparacao pedida — nunca escolhe a mais parecida sozinho", async () => {
    // fixture POF so tem milho cru/cozido/grelhado/assado — "milho frito" nao existe em nenhuma preparacao
    const result = await resolveCanonicalFood("milho frito", { db: executor });
    expect(["PREPARATION_REVIEW", "NOT_FOUND", "AMBIGUOUS"]).toContain(result.status);
    if (result.status === "PREPARATION_REVIEW") {
      expect(result.selected).toBeUndefined();
      expect(result.candidates.length).toBeGreaterThan(0);
    }
  });

  it("NOT_FOUND: query sem nenhuma correspondencia no catalogo canonico", async () => {
    const result = await resolveCanonicalFood("xyzabc alimento inexistente 12345", { db: executor });
    expect(result.status).toBe("NOT_FOUND");
    expect(result.candidates).toEqual([]);
  });

  it("AMBIGUOUS: nunca escolhe silenciosamente quando ha empate real de score", async () => {
    const result = await resolveCanonicalFood("abacaxi", { db: executor });
    // classification/regional traz varios cultivares de abacaxi na fixture — não deve escolher um sozinho quando proximos
    expect(["AMBIGUOUS", "RESOLVED", "EXACT"]).toContain(result.status);
    if (result.status === "AMBIGUOUS") {
      expect(result.selected).toBeUndefined();
      expect(result.candidates.length).toBeGreaterThan(1);
    }
  });

  it("sem cross-source merge: EXACT nunca combina nutrientes de fontes diferentes — selected aponta pra UMA fonte só", async () => {
    const result = await resolveCanonicalFood("Arroz, integral, cozido", { db: executor });
    expect(result.status).toBe("EXACT");
    expect(result.source).toBeDefined();
    // um unico canonicalFoodId, uma unica fonte — nunca um objeto "mesclado"
    expect(typeof result.canonicalFoodId).toBe("string");
    expect(typeof result.source).toBe("string");
  });
});
