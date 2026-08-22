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
 * FASE 6 (itens 11-15) — valida os 3 escopos reais contra D1 real, >=500
 * queries: admin_food_search (piloto prefer_canonical, mede
 * wrong_auto_accept com gabarito real), substitutions e meal_plan_ai
 * (shadow — nunca mudam comportamento, so medem quantas V2 auto-aceitaria).
 */
async function main() {
  const { searchFoods, toLegacyFoodSearchResponseItem } = await import("@/lib/nutrition/food-catalog");
  const { annotateAdminFoodSearchWithCanonicalPilot } = await import("@/lib/nutrition/canonical-food-admin-search");
  const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
  const { buildGroundTruth } = await import("./ground-truth");
  const { openLocalCanonicalDb } = await import("./local-db");
  const { FASE5_NATURAL_QUERIES } = await import("./fase5-natural-queries");

  const localDb = openLocalCanonicalDb(resolve("reports/canonical-nutrition-local.sqlite"));
  const groundTruth = buildGroundTruth(localDb);
  const gtByQuery = new Map(groundTruth.map((c) => [c.query, c.expectedFoodId]));
  const extraRows = localDb.prepare(`SELECT name FROM canonical_foods ORDER BY RANDOM() LIMIT 400`).all() as Array<{ name: string }>;
  localDb.close();

  const queries = [
    ...groundTruth.map((c) => c.query),
    ...FASE5_NATURAL_QUERIES,
    ...extraRows.map((r) => r.name.replace(/\s*,?\s*Brasil\s*$/i, "").replace(/\s*\([^)]*\)\s*$/g, "").trim()),
  ].filter((q, i, arr) => q.length >= 3 && arr.indexOf(q) === i);

  console.log(`FASE 6 — validando os 3 escopos com ${queries.length} queries reais contra D1 real...`);

  function percentile(sorted: number[], p: number): number {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  }
  function stats(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    return { n: values.length, p50: +percentile(sorted, 50).toFixed(2), p95: +percentile(sorted, 95).toFixed(2), p99: +percentile(sorted, 99).toFixed(2), max: +(sorted[sorted.length - 1] ?? 0).toFixed(2) };
  }

  // ---------- admin_food_search (piloto real) ----------
  const adminOutcomes = { autoAcceptV2: 0, fallbackCurrent: 0, ambiguous: 0, preparationReview: 0, notFound: 0, wrongAutoAccept: 0, errors: 0 };
  const adminLatCold: number[] = [];
  const adminLatWarm: number[] = [];
  const seenAdmin = new Set<string>();
  const wrongAutoAcceptSamples: Array<Record<string, unknown>> = [];

  let index = 0;
  const CONCURRENCY = 6;
  async function adminWorker() {
    while (index < queries.length) {
      const i = index++;
      const query = queries[i];
      const isWarm = seenAdmin.has(query.trim().toLowerCase());
      seenAdmin.add(query.trim().toLowerCase());
      const t0 = performance.now();
      try {
        const baselineItemsPromise = searchFoods({ query, limit: 10 }).then((results) => results.map(toLegacyFoodSearchResponseItem));
        const { canonicalPilot } = await annotateAdminFoodSearchWithCanonicalPilot(query, baselineItemsPromise);
        const ms = performance.now() - t0;
        (isWarm ? adminLatWarm : adminLatCold).push(ms);

        if (!canonicalPilot) {
          adminOutcomes.notFound++;
        } else if (canonicalPilot.preselected) {
          adminOutcomes.autoAcceptV2++;
          const expected = gtByQuery.get(query);
          if (expected && canonicalPilot.canonicalFoodId !== expected) {
            adminOutcomes.wrongAutoAccept++;
            if (wrongAutoAcceptSamples.length < 20) {
              wrongAutoAcceptSamples.push({ query, chosen: canonicalPilot.canonicalFoodId, expected, matchClass: canonicalPilot.matchClass });
            }
          }
        } else {
          adminOutcomes.fallbackCurrent++;
          if (canonicalPilot.confidenceDecision.reason.includes("variedades")) adminOutcomes.ambiguous++;
        }
      } catch {
        adminOutcomes.errors++;
      }
      if ((i + 1) % 150 === 0) console.log(`  admin_food_search ${i + 1}/${queries.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => adminWorker()));

  // ---------- substitutions e meal_plan_ai (shadow — so medicao) ----------
  async function shadowScopeRun(scope: "substitutions" | "meal_plan_ai") {
    const outcomes: Record<string, number> = { v2AutoAccept: 0, v2Blocked: 0, errors: 0 };
    const lat: number[] = [];
    let idx = 0;
    async function worker() {
      while (idx < queries.length) {
        const i = idx++;
        const query = queries[i];
        const t0 = performance.now();
        try {
          let v2Accepted = false;
          await resolveFoodWithCanonicalShadow(query, [], null, scope, {
            onTelemetry: (event) => {
              if (event.v2AutoAccept) v2Accepted = true;
            },
          });
          lat.push(performance.now() - t0);
          if (v2Accepted) outcomes.v2AutoAccept++;
          else outcomes.v2Blocked++;
        } catch {
          outcomes.errors++;
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    return { outcomes, latency: stats(lat) };
  }

  console.log("Rodando substitutions (shadow)...");
  const substitutionsResult = await shadowScopeRun("substitutions");
  console.log("Rodando meal_plan_ai (shadow)...");
  const mealPlanAiResult = await shadowScopeRun("meal_plan_ai");

  const report = {
    generatedAt: new Date().toISOString(),
    totalQueries: queries.length,
    adminFoodSearchPilot: {
      outcomes: adminOutcomes,
      latencyMs: { cold: stats(adminLatCold), warm: stats(adminLatWarm) },
    },
    substitutionsShadow: substitutionsResult,
    mealPlanAiShadow: mealPlanAiResult,
  };

  mkdirSync(resolve("reports"), { recursive: true });
  writeFileSync(resolve("reports/fase6-pilot-validation.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve("reports/fase6-wrong-auto-accept.json"), JSON.stringify(wrongAutoAcceptSamples, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
