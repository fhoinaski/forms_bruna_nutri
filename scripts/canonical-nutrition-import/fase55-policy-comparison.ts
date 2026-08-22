#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * FASE 5.5 (item 10/11) — compara V1 (canUseCanonical) vs V2
 * (canAutoResolveCanonicalV2) sobre o MESMO dataset rotulado
 * (reports/fase55-calibration-dataset.json, gerado por
 * fase55-calibration-dataset.ts). Nunca re-roda contra D1 — so agrega os
 * veredictos V1/V2 ja calculados junto de cada linha.
 *
 * Definicoes (documentadas porque "precision"/"coverage" nao tem uma
 * unica definicao padrao pra este problema):
 * - AMBIGUOUS_VALID conta como FALHA se auto-aceito (nunca "acertou por
 *   sorte" so porque o esperado empatou com o topo — um empate real
 *   NUNCA deveria ser auto-resolvido, ver item 7/resolveCanonicalFood).
 * - precision = TP / (TP + FP), onde TP = autoAccept && label=CORRECT,
 *   FP = autoAccept && label!=CORRECT.
 * - coverage = (TP+FP) / total de linhas com features (quanto do dataset
 *   o sistema teria resolvido sozinho).
 * - false_positive_rate = FP / total de linhas (quao frequente, do
 *   dataset INTEIRO, seria uma decisao automatica errada).
 * - ambiguous_rate = fracao do dataset cujo label e AMBIGUOUS_VALID
 *   (composicao do dataset) + fracao dessas em que a policy corretamente
 *   NAO auto-aceitou (comportamento seguro).
 */
interface Row {
  query: string;
  origin: string;
  label: "CORRECT" | "INCORRECT" | "AMBIGUOUS_VALID" | "NOT_ENOUGH_INFORMATION";
  topFoodId: string | null;
  topName: string | null;
  expectedFoodId: string | null;
  features: Record<string, unknown> | null;
  v1: { autoAccept: boolean };
  v2: { autoAccept: boolean; matchClass: string; queryRisk: string; reason: string } | null;
}

function main() {
  const rows = JSON.parse(readFileSync(resolve("reports/fase55-calibration-dataset.json"), "utf8")) as Row[];
  const withFeatures = rows.filter((r) => r.features !== null);

  function metrics(getAccept: (r: Row) => boolean) {
    const accepted = withFeatures.filter(getAccept);
    const tp = accepted.filter((r) => r.label === "CORRECT").length;
    const fp = accepted.length - tp;
    const precision = accepted.length ? tp / accepted.length : null;
    const coverage = withFeatures.length ? accepted.length / withFeatures.length : 0;
    const falsePositiveRate = withFeatures.length ? fp / withFeatures.length : 0;
    return { totalAccepted: accepted.length, truePositives: tp, falsePositives: fp, precision, coverage, falsePositiveRate };
  }

  const v1Metrics = metrics((r) => r.v1.autoAccept);
  const v2Metrics = metrics((r) => r.v2?.autoAccept ?? false);

  const ambiguousRows = withFeatures.filter((r) => r.label === "AMBIGUOUS_VALID");
  const ambiguousRate = withFeatures.length ? ambiguousRows.length / withFeatures.length : 0;
  const v1AmbiguousSafe = ambiguousRows.length ? ambiguousRows.filter((r) => !r.v1.autoAccept).length / ambiguousRows.length : 1;
  const v2AmbiguousSafe = ambiguousRows.length ? ambiguousRows.filter((r) => !(r.v2?.autoAccept ?? false)).length / ambiguousRows.length : 1;

  const falsePositivesV2 = withFeatures.filter((r) => (r.v2?.autoAccept ?? false) && r.label !== "CORRECT");

  const byMatchClassV2: Record<string, { total: number; accepted: number; tp: number; fp: number }> = {};
  for (const r of withFeatures) {
    const mc = String((r.features as Record<string, unknown>).matchClass);
    byMatchClassV2[mc] ??= { total: 0, accepted: 0, tp: 0, fp: 0 };
    byMatchClassV2[mc].total++;
    if (r.v2?.autoAccept) {
      byMatchClassV2[mc].accepted++;
      if (r.label === "CORRECT") byMatchClassV2[mc].tp++;
      else byMatchClassV2[mc].fp++;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalRows: rows.length,
    rowsWithFeatures: withFeatures.length,
    labelDistribution: Object.fromEntries(["CORRECT", "INCORRECT", "AMBIGUOUS_VALID", "NOT_ENOUGH_INFORMATION"].map((l) => [l, withFeatures.filter((r) => r.label === l).length])),
    v1: v1Metrics,
    v2: v2Metrics,
    ambiguousRate,
    v1AmbiguousHandledSafely: v1AmbiguousSafe,
    v2AmbiguousHandledSafely: v2AmbiguousSafe,
    v2ByMatchClass: byMatchClassV2,
    falsePositivesV2Count: falsePositivesV2.length,
  };

  mkdirSync(resolve("reports"), { recursive: true });
  writeFileSync(resolve("reports/fase55-policy-comparison.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve("reports/fase55-v2-false-positives.json"), JSON.stringify(falsePositivesV2, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main();
