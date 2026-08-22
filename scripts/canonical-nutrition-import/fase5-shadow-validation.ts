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
process.env.CANONICAL_FOOD_RESOLVER_MODE = "shadow";

/**
 * FASE 5 (itens 1-6) — validacao real de shadow mode contra D1 real, >=1000
 * queries, com auditoria heuristica de DIFFERENT_TOP/CANONICAL_FOUND_MORE.
 *
 * Diferente de scripts/canonical-nutrition-import/runtime-shadow-dataset.ts
 * (que so agrega telemetria HASH-only, o mesmo formato que vai pro logger
 * real), este script chama resolveFoodCandidate/resolveCanonicalFood
 * DIRETO (nao via resolveFoodWithCanonicalShadow) pra poder registrar nomes
 * completos SO NESTES ARQUIVOS DE RELATORIO LOCAIS — nunca no logger real
 * da aplicacao, que continua hash-only (ver lib/nutrition/canonical-food-shadow.ts).
 * E uma ferramenta de auditoria manual, nao telemetria de producao.
 */
async function main() {
  const { resolveFoodCandidate } = await import("@/lib/nutrition/food-resolver");
  const { resolveCanonicalFood } = await import("@/lib/nutrition/canonical-food-resolver");
  const { classifyOutcome, canUseCanonical } = await import("@/lib/nutrition/canonical-food-shadow");
  const { buildGroundTruth } = await import("./ground-truth");
  const { openLocalCanonicalDb } = await import("./local-db");
  const { FASE5_NATURAL_QUERIES } = await import("./fase5-natural-queries");

  const localDb = openLocalCanonicalDb(resolve("reports/canonical-nutrition-local.sqlite"));
  const groundTruth = buildGroundTruth(localDb);
  const extraRows = localDb
    .prepare(`SELECT name FROM canonical_foods ORDER BY RANDOM() LIMIT 850`)
    .all() as Array<{ name: string }>;
  localDb.close();

  const queries = [
    ...groundTruth.map((c) => c.query),
    ...FASE5_NATURAL_QUERIES,
    ...extraRows.map((r) => r.name.replace(/\s*,?\s*Brasil\s*$/i, "").replace(/\s*\([^)]*\)\s*$/g, "").trim()),
  ].filter((q, i, arr) => q.length >= 3 && arr.indexOf(q) === i);

  console.log(`FASE 5 — validando shadow mode com ${queries.length} queries reais contra D1 real...`);

  const outcomes: Record<string, number> = {};
  const latenciesCurrent: number[] = [];
  const latenciesCanonical: number[] = [];
  const coldLatenciesCanonical: number[] = [];
  const warmLatenciesCanonical: number[] = [];
  const seenNormalized = new Set<string>();

  let queryErrors = 0;
  let canonicalErrors = 0;
  const differentTopSamples: Array<Record<string, unknown>> = [];
  const foundMoreSamples: Array<Record<string, unknown>> = [];
  const confidencePolicyCandidates: Array<{ query: string; score: number; gap: number | null; wouldAutoAccept: boolean; currentStatus: string; sameIdentityAsCurrent: boolean | null }> = [];
  const sourceConflicts: Array<{ query: string; sources: string[]; scores: number[] }> = [];

  const CONCURRENCY = 6;
  let index = 0;
  async function worker() {
    while (index < queries.length) {
      const i = index++;
      const query = queries[i];
      const normKey = query.trim().toLowerCase();
      const isWarm = seenNormalized.has(normKey);
      seenNormalized.add(normKey);

      let current;
      let canonical;
      const t0 = performance.now();
      try {
        current = await resolveFoodCandidate(query, [], null);
        latenciesCurrent.push(performance.now() - t0);
      } catch (error) {
        queryErrors += 1;
        console.error(`  [erro resolver ATUAL #${i}] ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const t1 = performance.now();
      try {
        canonical = await resolveCanonicalFood(query, { limit: 8 });
        const canonicalMs = performance.now() - t1;
        latenciesCanonical.push(canonicalMs);
        (isWarm ? warmLatenciesCanonical : coldLatenciesCanonical).push(canonicalMs);
      } catch (error) {
        canonicalErrors += 1;
        console.error(`  [erro resolver CANONICO #${i}] ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      const outcome = classifyOutcome(current, canonical);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;

      const canonicalTop = canonical.selected ?? canonical.candidates[0] ?? null;
      const gap = (() => {
        const pool = canonical.selected ? [canonical.selected, ...canonical.candidates] : canonical.candidates;
        return pool.length < 2 ? null : pool[0].score - pool[1].score;
      })();

      // item 5: auditoria heuristica DIFFERENT_TOP — nunca assume que
      // "different" e erro; classifica por sobreposicao de tokens entre a
      // query e cada candidato, mas SEMPRE guarda os dados brutos pra
      // revisao humana (a heuristica e um pre-filtro, nao veredito final).
      if (outcome === "DIFFERENT_TOP" && differentTopSamples.length < 60) {
        const queryTokens = new Set(normKey.split(/\s+/).filter((t) => t.length > 2));
        function overlap(name: string | null): number {
          if (!name) return 0;
          const tokens = name.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
          return tokens.filter((t) => queryTokens.has(t)).length;
        }
        const currentOverlap = overlap(current.name);
        const canonicalOverlap = overlap(canonicalTop?.name ?? null);
        let heuristic: string;
        if (canonicalOverlap === 0 && currentOverlap === 0) heuristic = "TRUE_AMBIGUITY";
        else if (canonicalOverlap > currentOverlap) heuristic = "CANONICAL_BETTER";
        else if (currentOverlap > canonicalOverlap) heuristic = "CURRENT_BETTER";
        else if (canonicalOverlap === currentOverlap && canonicalOverlap > 0) heuristic = "BOTH_VALID";
        else heuristic = "TRUE_AMBIGUITY";
        if (canonicalTop && canonicalOverlap === 0 && (canonicalTop.score ?? 0) < 80) heuristic = "BAD_CANONICAL_MATCH";
        if (current.name && currentOverlap === 0) heuristic = "BAD_CURRENT_MATCH";

        differentTopSamples.push({
          query,
          currentStatus: current.status,
          currentName: current.name,
          currentSource: current.ref?.source ?? null,
          canonicalStatus: canonical.status,
          canonicalName: canonicalTop?.name ?? null,
          canonicalSource: canonicalTop?.source ?? null,
          canonicalScore: canonicalTop?.score ?? null,
          heuristicCategory: heuristic,
        });
      }

      // item 6: auditoria CANONICAL_FOUND_MORE — amostra representativa.
      if (outcome === "CANONICAL_FOUND_MORE" && foundMoreSamples.length < 60) {
        foundMoreSamples.push({
          query,
          canonicalName: canonicalTop?.name ?? null,
          canonicalSource: canonicalTop?.source ?? null,
          canonicalMatchMethod: canonicalTop?.matchMethod ?? null,
          canonicalScore: canonicalTop?.score ?? null,
          preparation: canonicalTop?.preparation?.name ?? null,
          classification: canonicalTop?.classification?.group ?? null,
        });
      }

      // item 7: confidence policy real — coleta score/gap de todo canonico
      // decisivo, pra medir precisao estimada sem ativar nada.
      if (canonicalTop && (canonical.status === "EXACT" || canonical.status === "RESOLVED")) {
        const wouldAutoAccept = canUseCanonical({
          status: canonical.status,
          score: canonicalTop.score,
          gapToSecond: gap,
          preparationConflict: (canonicalTop.scoreBreakdown?.preparationScore ?? 0) < 0,
        });
        const sameIdentityAsCurrent = current.status === "RESOLVED"
          ? current.ref?.source === canonicalTop.source && current.ref?.sourceId === canonicalTop.sourceFoodId
          : null;
        confidencePolicyCandidates.push({ query, score: canonicalTop.score, gap, wouldAutoAccept, currentStatus: current.status, sameIdentityAsCurrent });
      }

      // item 8: source policy — quando ha 2+ candidatos canonicos de fontes
      // DIFERENTES pro mesmo termo, registra pra analise de conflito real.
      const distinctSources = new Set([canonical.selected, ...canonical.candidates].filter(Boolean).map((c) => c!.source));
      if (distinctSources.size >= 2 && sourceConflicts.length < 100) {
        const pool = canonical.selected ? [canonical.selected, ...canonical.candidates] : canonical.candidates;
        sourceConflicts.push({ query, sources: pool.map((c) => c.source), scores: pool.map((c) => c.score) });
      }

      if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${queries.length}`);
    }
  }
  const start = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const elapsedSec = (Date.now() - start) / 1000;

  function percentile(sorted: number[], p: number): number {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  }
  function stats(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      n: values.length,
      p50: Math.round(percentile(sorted, 50) * 100) / 100,
      p95: Math.round(percentile(sorted, 95) * 100) / 100,
      p99: Math.round(percentile(sorted, 99) * 100) / 100,
      max: Math.round((sorted[sorted.length - 1] ?? 0) * 100) / 100,
    };
  }

  const decisiveCandidates = confidencePolicyCandidates.filter((c) => c.wouldAutoAccept);
  const withKnownIdentity = decisiveCandidates.filter((c) => c.sameIdentityAsCurrent !== null);
  const precisionEstimate = withKnownIdentity.length
    ? withKnownIdentity.filter((c) => c.sameIdentityAsCurrent).length / withKnownIdentity.length
    : null;

  const report = {
    generatedAt: new Date().toISOString(),
    totalQueries: queries.length,
    elapsedSec,
    queryErrors,
    canonicalErrors,
    outcomes,
    latencyMs: {
      current: stats(latenciesCurrent),
      canonical: stats(latenciesCanonical),
      canonicalCold: stats(coldLatenciesCanonical),
      canonicalWarm: stats(warmLatenciesCanonical),
    },
    confidencePolicy: {
      totalDecisiveCanonical: decisiveCandidates.length,
      withKnownCurrentIdentity: withKnownIdentity.length,
      precisionEstimate,
      note: "precisionEstimate so cobre casos onde o resolver ATUAL tambem resolveu (RESOLVED) pra comparar identidade — casos NOT_FOUND/AMBIGUOUS no atual nao tem 'gabarito' de comparacao aqui.",
    },
    sourceConflictsSampleCount: sourceConflicts.length,
  };

  mkdirSync(resolve("reports"), { recursive: true });
  writeFileSync(resolve("reports/fase5-shadow-validation.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve("reports/fase5-different-top-audit.json"), JSON.stringify(differentTopSamples, null, 2));
  writeFileSync(resolve("reports/fase5-canonical-found-more-audit.json"), JSON.stringify(foundMoreSamples, null, 2));
  writeFileSync(resolve("reports/fase5-source-conflicts.json"), JSON.stringify(sourceConflicts, null, 2));

  console.log(JSON.stringify(report, null, 2));
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
