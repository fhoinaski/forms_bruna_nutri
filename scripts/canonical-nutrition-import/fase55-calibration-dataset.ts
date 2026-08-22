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
 * FASE 5.5 (item 2) — dataset de calibracao ROTULADO, montado a partir de
 * 3 fontes reais, nunca fabricado:
 *
 * 1. GROUND TRUTH (Fases 3.5/4/5, buildGroundTruth) — a fonte MAIS FORTE:
 *    cada query e uma reducao natural do NOME REAL de um alimento que
 *    existe no banco, com expectedFoodId conhecido de verdade. Label
 *    objetivo: CORRECT se o topo bate com expectedFoodId, AMBIGUOUS_VALID
 *    se empata em score com o esperado, INCORRECT caso contrario.
 *
 * 2. DIFFERENT_TOP e CANONICAL_FOUND_MORE auditados na Fase 5
 *    (reports/fase5-different-top-audit.json,
 *    reports/fase5-canonical-found-more-audit.json) — reusa a
 *    classificacao heuristica ja feita (e corrigida) na Fase 5, convertida
 *    pra CORRECT/INCORRECT/AMBIGUOUS_VALID.
 *
 * 3. Uma amostra fresca de queries naturais+aleatorias rodada AGORA, usada
 *    SO pra colher casos reais de status AMBIGUOUS/PREPARATION_REVIEW
 *    (rotulados AMBIGUOUS_VALID/NOT_ENOUGH_INFORMATION) — nunca rotulados
 *    CORRECT/INCORRECT sem um gabarito real (nao fabrica label).
 *
 * Cada linha registra as FEATURES completas (lib/nutrition/
 * canonical-confidence-features.ts) do candidato TOPO, pra V1 e V2 serem
 * comparadas sobre o MESMO dataset rotulado.
 */
async function main() {
  const { canonicalFoodSearch, resolveQueryPreparation } = await import("@/lib/nutrition/canonical-food-search");
  const { extractConfidenceFeatures } = await import("@/lib/nutrition/canonical-confidence-features");
  const { canUseCanonical } = await import("@/lib/nutrition/canonical-food-shadow");
  const { canAutoResolveCanonicalV2 } = await import("@/lib/nutrition/canonical-confidence-v2");
  const { buildGroundTruth } = await import("./ground-truth");
  const { openLocalCanonicalDb } = await import("./local-db");
  const { FASE5_NATURAL_QUERIES } = await import("./fase5-natural-queries");

  const localDb = openLocalCanonicalDb(resolve("reports/canonical-nutrition-local.sqlite"));
  const groundTruth = buildGroundTruth(localDb);
  const extraRows = localDb.prepare(`SELECT name FROM canonical_foods ORDER BY RANDOM() LIMIT 300`).all() as Array<{ name: string }>;
  localDb.close();

  interface Row {
    query: string;
    origin: "ground_truth" | "different_top_audit" | "found_more_audit" | "fresh_sample";
    label: "CORRECT" | "INCORRECT" | "AMBIGUOUS_VALID" | "NOT_ENOUGH_INFORMATION";
    topFoodId: string | null;
    topName: string | null;
    expectedFoodId: string | null;
    features: ReturnType<typeof extractConfidenceFeatures>;
    v1: { autoAccept: boolean };
    v2: ReturnType<typeof canAutoResolveCanonicalV2> | null;
  }

  const rows: Row[] = [];

  function evaluate(query: string, results: Awaited<ReturnType<typeof canonicalFoodSearch>>, queryPreparation: ReturnType<typeof resolveQueryPreparation>) {
    if (!results.length) return { features: null as ReturnType<typeof extractConfidenceFeatures>, v1: { autoAccept: false }, v2: null as ReturnType<typeof canAutoResolveCanonicalV2> | null };
    const features = extractConfidenceFeatures(query, results, queryPreparation);
    if (!features) return { features: null, v1: { autoAccept: false }, v2: null };
    const gap = features.gapToSecond;
    const v1AutoAccept = features.totalScore >= 90 && (gap === null || gap >= 8) && !features.preparationConflict;
    const v2 = canAutoResolveCanonicalV2(features);
    return { features, v1: { autoAccept: v1AutoAccept }, v2 };
  }

  console.log(`1) ground truth: ${groundTruth.length} casos (labels reais)`);
  for (const c of groundTruth) {
    const queryPreparation = resolveQueryPreparation({ query: c.query });
    const results = await canonicalFoodSearch({ query: c.query, limit: 8 });
    const { features, v1, v2 } = evaluate(c.query, results, queryPreparation);
    if (!results.length) {
      rows.push({ query: c.query, origin: "ground_truth", label: "NOT_ENOUGH_INFORMATION", topFoodId: null, topName: null, expectedFoodId: c.expectedFoodId, features: null, v1, v2 });
      continue;
    }
    const top = results[0];
    const expectedIdx = results.findIndex((r) => r.foodId === c.expectedFoodId);
    let label: Row["label"];
    if (top.foodId === c.expectedFoodId) label = "CORRECT";
    else if (expectedIdx > 0 && results[expectedIdx].score === top.score) label = "AMBIGUOUS_VALID";
    else label = "INCORRECT";
    rows.push({ query: c.query, origin: "ground_truth", label, topFoodId: top.foodId, topName: top.name, expectedFoodId: c.expectedFoodId, features, v1, v2 });
  }

  console.log("2) reusando auditoria DIFFERENT_TOP/CANONICAL_FOUND_MORE da Fase 5...");
  const differentTop = JSON.parse(readFileSync(resolve("reports/fase5-different-top-audit.json"), "utf8")) as Array<Record<string, unknown>>;
  for (const d of differentTop) {
    const query = String(d.query);
    const queryPreparation = resolveQueryPreparation({ query });
    const results = await canonicalFoodSearch({ query, limit: 8 });
    const { features, v1, v2 } = evaluate(query, results, queryPreparation);
    if (!results.length) continue;
    const heuristic = String(d.heuristicCategory);
    const label: Row["label"] =
      heuristic === "TRUE_AMBIGUITY" ? "AMBIGUOUS_VALID" :
      heuristic === "CURRENT_BETTER" || heuristic === "BAD_CANONICAL_MATCH" ? "INCORRECT" :
      "CORRECT"; // BOTH_VALID/CANONICAL_BETTER: o topo canonico e valido
    rows.push({ query, origin: "different_top_audit", label, topFoodId: results[0].foodId, topName: results[0].name, expectedFoodId: null, features, v1, v2 });
  }

  const foundMore = JSON.parse(readFileSync(resolve("reports/fase5-canonical-found-more-audit.json"), "utf8")) as Array<Record<string, unknown>>;
  for (const d of foundMore) {
    const query = String(d.query);
    const queryPreparation = resolveQueryPreparation({ query });
    const results = await canonicalFoodSearch({ query, limit: 8 });
    const { features, v1, v2 } = evaluate(query, results, queryPreparation);
    if (!results.length) continue;
    // Fase 5 (item 6) ja inspecionou manualmente esta amostra inteira e
    // confirmou 0 casos de match semanticamente errado — reusa esse
    // veredito humano, nunca refaz a inspecao automaticamente aqui.
    rows.push({ query, origin: "found_more_audit", label: "CORRECT", topFoodId: results[0].foodId, topName: results[0].name, expectedFoodId: null, features, v1, v2 });
  }

  console.log("3) amostra fresca (natural + aleatoria) so pra AMBIGUOUS_VALID/NOT_ENOUGH_INFORMATION reais...");
  const freshQueries = [
    ...FASE5_NATURAL_QUERIES,
    ...extraRows.map((r) => r.name.replace(/\s*,?\s*Brasil\s*$/i, "").replace(/\s*\([^)]*\)\s*$/g, "").trim()),
  ].filter((q, i, arr) => q.length >= 3 && arr.indexOf(q) === i);

  let freshProcessed = 0;
  for (const query of freshQueries) {
    const queryPreparation = resolveQueryPreparation({ query });
    const results = await canonicalFoodSearch({ query, limit: 8 });
    const { features, v1, v2 } = evaluate(query, results, queryPreparation);
    if (!results.length) continue;
    const top = results[0];
    const second = results[1];
    const gap = second ? top.score - second.score : Infinity;
    // Reimplementa so a CLASSIFICACAO de estado (nunca decide auto-aceite
    // aqui) pra saber se este caso e genuinamente ambiguo/precisa revisao —
    // MESMO criterio de decisive/gap de lib/nutrition/canonical-food-resolver.ts.
    const decisive = gap >= 8;
    if (!decisive) {
      rows.push({ query, origin: "fresh_sample", label: "AMBIGUOUS_VALID", topFoodId: top.foodId, topName: top.name, expectedFoodId: null, features, v1, v2 });
    }
    freshProcessed++;
    if (freshProcessed % 100 === 0) console.log(`   ${freshProcessed}/${freshQueries.length}`);
  }

  mkdirSync(resolve("reports"), { recursive: true });
  writeFileSync(resolve("reports/fase55-calibration-dataset.json"), JSON.stringify(rows, null, 2));

  const byOrigin: Record<string, number> = {};
  const byLabel: Record<string, number> = {};
  for (const r of rows) {
    byOrigin[r.origin] = (byOrigin[r.origin] ?? 0) + 1;
    byLabel[r.label] = (byLabel[r.label] ?? 0) + 1;
  }
  console.log(`Dataset final: ${rows.length} linhas rotuladas.`);
  console.log("por origem:", JSON.stringify(byOrigin));
  console.log("por label:", JSON.stringify(byLabel));
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
