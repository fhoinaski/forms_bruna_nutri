#!/usr/bin/env node
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalFoodSearch } from "@/lib/nutrition/canonical-food-search";
import { localCanonicalExecutor } from "./local-executor";

/**
 * FASE 3 (item 16) — benchmark de performance contra o banco canonico
 * COMPLETO (TBCA+TACO+POF reais, 10.063 alimentos). Nunca contra o JSON
 * bruto.
 */

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

function stats(durations: number[]) {
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? 0,
    min: sorted[0] ?? 0,
    avg: sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1),
  };
}

// Termos reais derivados do proprio catalogo (nomes/fragmentos reais de
// alimentos TBCA/TACO/POF), classificados por tipo de busca esperado.
const EXACT_QUERIES = ["arroz integral cozido", "feijão preto cozido", "abacate", "banana prata", "leite integral", "mamão", "azeite de dendê", "milho cozido", "iogurte natural", "ovo cozido"];
const PARTIAL_QUERIES = ["arroz", "feijão", "frango", "peixe", "banana", "leite", "queijo", "pão", "batata", "tomate", "cenoura", "maçã", "laranja", "abóbora", "carne"];
const AMBIGUOUS_QUERIES = ["milho", "peito de frango", "leite desnatado", "arroz branco", "suco de laranja"];

function buildQuerySet(total: number): { query: string; kind: "exact" | "partial" | "ambiguous" }[] {
  const pools: Array<{ pool: string[]; kind: "exact" | "partial" | "ambiguous" }> = [
    { pool: EXACT_QUERIES, kind: "exact" },
    { pool: PARTIAL_QUERIES, kind: "partial" },
    { pool: AMBIGUOUS_QUERIES, kind: "ambiguous" },
  ];
  const queries: { query: string; kind: "exact" | "partial" | "ambiguous" }[] = [];
  for (let i = 0; i < total; i += 1) {
    const { pool, kind } = pools[i % pools.length];
    const query = pool[i % pool.length];
    queries.push({ query, kind });
  }
  return queries;
}

async function main() {
  const dbPath = resolve("reports/canonical-nutrition-local.sqlite");
  const { db, executor } = localCanonicalExecutor(dbPath);
  const dbSizeBytes = statSync(dbPath).size;
  const foodCount = (db.prepare("SELECT COUNT(*) AS n FROM canonical_foods").get() as { n: number }).n;

  const totalSearches = 1200;
  const queries = buildQuerySet(totalSearches);
  const durationsAll: number[] = [];
  const durationsByKind: Record<string, number[]> = { exact: [], partial: [], ambiguous: [] };

  for (const { query, kind } of queries) {
    const start = performance.now();
    await canonicalFoodSearch({ query, db: executor, limit: 10 });
    const elapsed = performance.now() - start;
    durationsAll.push(elapsed);
    durationsByKind[kind].push(elapsed);
  }

  db.close();

  const report = {
    generatedAt: new Date().toISOString(),
    databaseSizeBytes: dbSizeBytes,
    databaseSizeMb: Math.round((dbSizeBytes / 1024 / 1024) * 100) / 100,
    foodsIndexed: foodCount,
    totalSearches,
    overallMs: stats(durationsAll),
    byKindMs: {
      exact: stats(durationsByKind.exact),
      partial: stats(durationsByKind.partial),
      ambiguous: stats(durationsByKind.ambiguous),
    },
  };

  mkdirSync(resolve("reports"), { recursive: true });
  writeFileSync(resolve("reports/canonical-search-benchmark.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
