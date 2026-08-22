#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalFoodSearch, type CanonicalScoreBreakdown } from "@/lib/nutrition/canonical-food-search";
import { resolveCanonicalFood } from "@/lib/nutrition/canonical-food-resolver";
import { buildGroundTruth, type GroundTruthCase } from "./ground-truth";
import { localCanonicalExecutor } from "./local-executor";

/**
 * FASE 3.5 (item 7) — metricas de qualidade contra o ground truth real
 * (item 6). Mede top1_correct/top3_contains_expected/ambiguous_rate/
 * not_found_rate/preparation_review_rate — nunca so "found more" (Fase 3
 * ja tinha esse numero, mas ele nao mede QUALIDADE do topo).
 *
 * "legacy" reconstrói o score ANTES desta rodada (subtrai simplicityScore/
 * extraTokenPenalty do total, reordena) sobre o MESMO conjunto de
 * candidatos — isola o efeito exato das mudancas de ranking desta fase,
 * sem precisar reverter codigo/reimportar nada.
 */

interface QueryMetrics {
  top1Correct: number;
  top3ContainsExpected: number;
  ambiguousRate: number;
  notFoundRate: number;
  preparationReviewRate: number;
  total: number;
}

function legacyScore(breakdown: CanonicalScoreBreakdown): number {
  return breakdown.nameScore + breakdown.preparationScore + breakdown.classificationScore + breakdown.richnessScore + breakdown.sourceTiebreak + breakdown.ftsScore;
}

async function evaluate(
  cases: GroundTruthCase[],
  executor: (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>,
  useLegacyScore: boolean
): Promise<{ metrics: QueryMetrics; perCase: Array<{ query: string; expected: string; top1: string | null; top1Correct: boolean; top3Correct: boolean; status: string }> }> {
  let top1Correct = 0;
  let top3Contains = 0;
  let ambiguous = 0;
  let notFound = 0;
  let prepReview = 0;
  const perCase: Array<{ query: string; expected: string; top1: string | null; top1Correct: boolean; top3Correct: boolean; status: string }> = [];

  for (const testCase of cases) {
    const rawResults = await canonicalFoodSearch({ query: testCase.query, db: executor, limit: 10 });
    const results = useLegacyScore
      ? [...rawResults].sort((a, b) => legacyScore(b.scoreBreakdown) - legacyScore(a.scoreBreakdown))
      : rawResults;

    const top1 = results[0] ?? null;
    const top3 = results.slice(0, 3);
    const isTop1Correct = top1?.foodId === testCase.expectedFoodId;
    const isTop3Correct = top3.some((r) => r.foodId === testCase.expectedFoodId);
    if (isTop1Correct) top1Correct += 1;
    if (isTop3Correct) top3Contains += 1;

    const resolution = await resolveCanonicalFood(testCase.query, { db: executor, limit: 10 });
    if (resolution.status === "AMBIGUOUS") ambiguous += 1;
    if (resolution.status === "NOT_FOUND") notFound += 1;
    if (resolution.status === "PREPARATION_REVIEW") prepReview += 1;

    perCase.push({
      query: testCase.query,
      expected: testCase.expectedName,
      top1: top1?.name ?? null,
      top1Correct: isTop1Correct,
      top3Correct: isTop3Correct,
      status: resolution.status,
    });
  }

  const total = cases.length;
  return {
    metrics: {
      top1Correct: Math.round((top1Correct / total) * 10000) / 100,
      top3ContainsExpected: Math.round((top3Contains / total) * 10000) / 100,
      ambiguousRate: Math.round((ambiguous / total) * 10000) / 100,
      notFoundRate: Math.round((notFound / total) * 10000) / 100,
      preparationReviewRate: Math.round((prepReview / total) * 10000) / 100,
      total,
    },
    perCase,
  };
}

/**
 * Item 2/8 — nao da pra medir "banana" contra um unico foodId esperado
 * (varias bananas simples sao respostas igualmente corretas), entao isso
 * mede diretamente o problema real do shadow report: o TOP1 de uma query
 * curta/generica e um prato composto (classification_food_type = 'D -
 * Preparação') ou um item cujo nome contem tokens muito alem da query
 * (>=6 tokens extras)? Comparado legacy vs novo, sobre as MESMAS queries
 * problematicas encontradas na Fase 3.
 */
const SIMPLE_VS_COMPOSITE_QUERIES = ["banana", "arroz branco", "leite integral", "leite desnatado", "banana flambada", "arroz de coco"];

async function evaluateSimpleVsComposite(
  executor: (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>,
  useLegacyScore: boolean
) {
  const rows: Array<{ query: string; top1: string | null; foodType: string | null; extraTokens: number }> = [];
  for (const query of SIMPLE_VS_COMPOSITE_QUERIES) {
    const raw = await canonicalFoodSearch({ query, db: executor, limit: 10 });
    const results = useLegacyScore ? [...raw].sort((a, b) => legacyScore(b.scoreBreakdown) - legacyScore(a.scoreBreakdown)) : raw;
    const top1 = results[0] ?? null;
    rows.push({
      query,
      top1: top1?.name ?? null,
      foodType: top1?.classification?.foodType ?? null,
      extraTokens: top1 ? -top1.scoreBreakdown.extraTokenPenalty : 0,
    });
  }
  return rows;
}

async function main() {
  const dbPath = resolve(process.argv[2] ?? "reports/canonical-nutrition-local.sqlite");
  const { db, executor } = localCanonicalExecutor(dbPath);

  const simpleVsCompositeBefore = await evaluateSimpleVsComposite(executor, true);
  const simpleVsCompositeAfter = await evaluateSimpleVsComposite(executor, false);

  const cases = buildGroundTruth(db);
  const byCategory: Record<string, number> = {};
  for (const c of cases) byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;

  const after = await evaluate(cases, executor, false);
  const before = await evaluate(cases, executor, true);

  db.close();

  const regressions = after.perCase.filter((afterCase, index) => {
    const beforeCase = before.perCase[index];
    return beforeCase.top1Correct && !afterCase.top1Correct;
  });
  const improvements = after.perCase.filter((afterCase, index) => {
    const beforeCase = before.perCase[index];
    return !beforeCase.top1Correct && afterCase.top1Correct;
  });

  const report = {
    generatedAt: new Date().toISOString(),
    totalCases: cases.length,
    byCategory,
    simpleVsComposite: { before: simpleVsCompositeBefore, after: simpleVsCompositeAfter },
    before: before.metrics,
    after: after.metrics,
    regressions: regressions.map((r) => ({ query: r.query, expected: r.expected, before: before.perCase[after.perCase.indexOf(r)]?.top1 ?? null, after: r.top1 })),
    improvements: improvements.map((r) => ({ query: r.query, expected: r.expected, after: r.top1 })),
  };

  mkdirSync(resolve("reports"), { recursive: true });
  writeFileSync(resolve("reports/canonical-search-quality.json"), JSON.stringify({ ...report, perCaseAfter: after.perCase }, null, 2));

  const md = [
    "# Qualidade do ranking canônico — antes/depois (Fase 3.5)",
    "",
    `Gerado em: ${report.generatedAt}`,
    `Total de casos (ground truth real, auto-referencial): ${report.totalCases}`,
    "",
    "## Por categoria",
    "",
    ...Object.entries(byCategory).map(([cat, n]) => `- ${cat}: ${n}`),
    "",
    "## Alimento simples vs prato composto (queries genéricas reais do shadow report)",
    "",
    "| query | top1 antes | top1 depois |",
    "|---|---|---|",
    ...SIMPLE_VS_COMPOSITE_QUERIES.map((q, i) => `| ${q} | ${simpleVsCompositeBefore[i].top1} | ${simpleVsCompositeAfter[i].top1} |`),
    "",
    "## Métricas",
    "",
    "| métrica | antes | depois |",
    "|---|---:|---:|",
    `| top1_correct | ${before.metrics.top1Correct}% | ${after.metrics.top1Correct}% |`,
    `| top3_contains_expected | ${before.metrics.top3ContainsExpected}% | ${after.metrics.top3ContainsExpected}% |`,
    `| ambiguous_rate | ${before.metrics.ambiguousRate}% | ${after.metrics.ambiguousRate}% |`,
    `| not_found_rate | ${before.metrics.notFoundRate}% | ${after.metrics.notFoundRate}% |`,
    `| preparation_review_rate | ${before.metrics.preparationReviewRate}% | ${after.metrics.preparationReviewRate}% |`,
    "",
    `## Regressões (top1 correto antes, errado depois): ${regressions.length}`,
    "",
    ...regressions.map((r) => `- "${r.query}" esperado "${r.expected}" → agora "${r.top1}"`),
    "",
    `## Melhorias (top1 errado antes, correto depois): ${improvements.length}`,
    "",
    ...improvements.slice(0, 30).map((r) => `- "${r.query}" → "${r.top1}"`),
  ].join("\n");
  writeFileSync(resolve("reports/canonical-search-quality.md"), md);

  console.log(JSON.stringify({ before: before.metrics, after: after.metrics, regressions: regressions.length, improvements: improvements.length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
