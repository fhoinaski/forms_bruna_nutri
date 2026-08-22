#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

/**
 * FASE 5.5 (item 15) — reroda >=1000 queries reais contra D1 real,
 * registrando a decisao V1 e V2 lado a lado pra CADA uma (nao so as
 * ambiguas, como o dataset de calibracao) — inclui gabarito real (ground
 * truth) quando disponivel.
 */
async function main() {
  const { canonicalFoodSearch, resolveQueryPreparation } = await import("@/lib/nutrition/canonical-food-search");
  const { extractConfidenceFeatures } = await import("@/lib/nutrition/canonical-confidence-features");
  const { canAutoResolveCanonicalV2 } = await import("@/lib/nutrition/canonical-confidence-v2");
  const { buildGroundTruth } = await import("./ground-truth");
  const { openLocalCanonicalDb } = await import("./local-db");
  const { FASE5_NATURAL_QUERIES } = await import("./fase5-natural-queries");

  const localDb = openLocalCanonicalDb(resolve("reports/canonical-nutrition-local.sqlite"));
  const groundTruth = buildGroundTruth(localDb);
  const gtByQuery = new Map(groundTruth.map((c) => [c.query, c.expectedFoodId]));
  const extraRows = localDb.prepare(`SELECT name FROM canonical_foods ORDER BY RANDOM() LIMIT 850`).all() as Array<{ name: string }>;
  localDb.close();

  const queries = [
    ...groundTruth.map((c) => c.query),
    ...FASE5_NATURAL_QUERIES,
    ...extraRows.map((r) => r.name.replace(/\s*,?\s*Brasil\s*$/i, "").replace(/\s*\([^)]*\)\s*$/g, "").trim()),
  ].filter((q, i, arr) => q.length >= 3 && arr.indexOf(q) === i);

  console.log(`Rodando V1 vs V2 sobre ${queries.length} queries reais...`);

  let v1Accept = 0;
  let v2Accept = 0;
  let bothAccept = 0;
  let onlyV1 = 0;
  let onlyV2 = 0;
  let neither = 0;
  let v1CorrectOfAccepted = 0;
  let v1TotalWithGt = 0;
  let v2CorrectOfAccepted = 0;
  let v2TotalWithGt = 0;
  const disagreements: Array<Record<string, unknown>> = [];

  const CONCURRENCY = 6;
  let index = 0;
  async function worker() {
    while (index < queries.length) {
      const i = index++;
      const query = queries[i];
      const prep = resolveQueryPreparation({ query });
      const results = await canonicalFoodSearch({ query, limit: 8 });
      if (!results.length) continue;
      const features = extractConfidenceFeatures(query, results, prep);
      if (!features) continue;
      const gap = features.gapToSecond;
      const v1 = features.totalScore >= 90 && (gap === null || gap >= 8) && !features.preparationConflict;
      const v2 = canAutoResolveCanonicalV2(features);

      if (v1) v1Accept++;
      if (v2.autoAccept) v2Accept++;
      if (v1 && v2.autoAccept) bothAccept++;
      else if (v1 && !v2.autoAccept) onlyV1++;
      else if (!v1 && v2.autoAccept) onlyV2++;
      else neither++;

      const expected = gtByQuery.get(query);
      if (expected) {
        if (v1) {
          v1TotalWithGt++;
          if (results[0].foodId === expected) v1CorrectOfAccepted++;
        }
        if (v2.autoAccept) {
          v2TotalWithGt++;
          if (results[0].foodId === expected) v2CorrectOfAccepted++;
        }
      }

      if (v1 !== v2.autoAccept && disagreements.length < 100) {
        disagreements.push({ query, topName: results[0].name, v1Accept: v1, v2Accept: v2.autoAccept, v2Reason: v2.reason, matchClass: features.matchClass, score: features.totalScore, gap: features.gapToSecond });
      }
      if ((i + 1) % 150 === 0) console.log(`  ${i + 1}/${queries.length}`);
    }
  }
  const start = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const elapsedSec = (Date.now() - start) / 1000;

  const report = {
    generatedAt: new Date().toISOString(),
    totalQueries: queries.length,
    elapsedSec,
    v1Accept,
    v2Accept,
    bothAccept,
    onlyV1,
    onlyV2,
    neither,
    agreementRate: (bothAccept + neither) / queries.length,
    v1CoverageRate: v1Accept / queries.length,
    v2CoverageRate: v2Accept / queries.length,
    v1PrecisionOnGroundTruthAccepted: v1TotalWithGt ? v1CorrectOfAccepted / v1TotalWithGt : null,
    v2PrecisionOnGroundTruthAccepted: v2TotalWithGt ? v2CorrectOfAccepted / v2TotalWithGt : null,
  };
  mkdirSync(resolve("reports"), { recursive: true });
  writeFileSync(resolve("reports/fase55-shadow-v1-v2.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve("reports/fase55-v1-v2-disagreements.json"), JSON.stringify(disagreements, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
