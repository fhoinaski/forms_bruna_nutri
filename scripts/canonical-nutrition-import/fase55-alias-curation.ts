#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * FASE 5.5 (item 12) — propoe aliases a partir dos casos REAIS do dataset
 * de calibracao (reports/fase55-calibration-dataset.json) — nunca insere
 * nada sozinho. Classifica em 3 niveis de seguranca:
 *
 * - SAFE_ALIAS: query curta/natural, o candidato correto (CORRECT) foi
 *   achado via EXACT_ALIAS/EXACT_NAME/EXACT_NAME_AND_PREPARATION — so
 *   precisa de confirmacao humana rapida antes de virar linha real.
 * - REQUIRES_REVIEW: candidato correto achado via match mais fraco
 *   (STRONG_TOKEN_MATCH/FTS_PARTIAL) — precisa de revisao mais cuidadosa
 *   (o alias podeia "vazar" pra um alimento errado se o catalogo mudar).
 * - UNSAFE: casos rotulados INCORRECT ou AMBIGUOUS_VALID — nunca virar
 *   alias (o proprio dataset mostra que a identidade nao e clara aqui).
 */
interface Row {
  query: string;
  origin: string;
  label: "CORRECT" | "INCORRECT" | "AMBIGUOUS_VALID" | "NOT_ENOUGH_INFORMATION";
  topFoodId: string | null;
  topName: string | null;
  expectedFoodId: string | null;
  features: Record<string, unknown> | null;
}

function main() {
  const rows = JSON.parse(readFileSync(resolve("reports/fase55-calibration-dataset.json"), "utf8")) as Row[];

  interface Candidate {
    query: string;
    topName: string;
    matchClass: string;
    safety: "SAFE_ALIAS" | "REQUIRES_REVIEW" | "UNSAFE";
    reason: string;
  }
  const candidates: Candidate[] = [];

  for (const r of rows) {
    if (!r.features || !r.topName) continue;
    const matchClass = String(r.features.matchClass);
    if (matchClass === "EXACT_ALIAS") continue; // ja e alias, nada a propor
    if (r.label === "CORRECT") {
      if (matchClass === "EXACT_NAME" || matchClass === "EXACT_NAME_AND_PREPARATION") {
        candidates.push({ query: r.query, topName: r.topName, matchClass, safety: "SAFE_ALIAS", reason: "Resultado correto (ground truth real ou auditoria manual da Fase 5) com match exato de nome — alias so formaliza o que ja funciona." });
      } else if (matchClass === "STRONG_TOKEN_MATCH" || matchClass === "FTS_PARTIAL") {
        candidates.push({ query: r.query, topName: r.topName, matchClass, safety: "REQUIRES_REVIEW", reason: "Resultado correto, mas via match fraco (token/FTS) — precisa confirmar que a query sempre aponta pra esse alimento antes de virar alias fixo." });
      }
    } else if (r.label === "INCORRECT" || r.label === "AMBIGUOUS_VALID") {
      candidates.push({ query: r.query, topName: r.topName, matchClass, safety: "UNSAFE", reason: `Rotulado ${r.label} no dataset de calibracao — identidade NAO esta clara, nunca deveria virar alias.` });
    }
  }

  const bySafety = { SAFE_ALIAS: candidates.filter((c) => c.safety === "SAFE_ALIAS"), REQUIRES_REVIEW: candidates.filter((c) => c.safety === "REQUIRES_REVIEW"), UNSAFE: candidates.filter((c) => c.safety === "UNSAFE") };

  const md = [
    "# Alias Curation — Fase 5.5 (item 12)",
    "",
    `Gerado em: ${new Date().toISOString()}`,
    "",
    "Classificação de segurança derivada do dataset de calibração real",
    "(`reports/fase55-calibration-dataset.json`) — nenhum alias inserido",
    "automaticamente.",
    "",
    `## SAFE_ALIAS (${bySafety.SAFE_ALIAS.length}) — candidatos fortes, só precisam de confirmação rápida`,
    "",
    "| query | resultado | match class |",
    "|---|---|---|",
    ...bySafety.SAFE_ALIAS.slice(0, 40).map((c) => `| ${c.query} | ${c.topName} | ${c.matchClass} |`),
    "",
    `## REQUIRES_REVIEW (${bySafety.REQUIRES_REVIEW.length}) — precisam de revisão cuidadosa`,
    "",
    "| query | resultado | match class |",
    "|---|---|---|",
    ...bySafety.REQUIRES_REVIEW.slice(0, 40).map((c) => `| ${c.query} | ${c.topName} | ${c.matchClass} |`),
    "",
    `## UNSAFE (${bySafety.UNSAFE.length}) — nunca devem virar alias`,
    "",
    "| query | resultado | motivo |",
    "|---|---|---|",
    ...bySafety.UNSAFE.slice(0, 40).map((c) => `| ${c.query} | ${c.topName} | ${c.reason} |`),
  ].join("\n");

  mkdirSync(resolve("reports"), { recursive: true });
  writeFileSync(resolve("reports/fase55-alias-curation.md"), md);
  writeFileSync(resolve("reports/fase55-alias-curation.json"), JSON.stringify(bySafety, null, 2));
  console.log(`SAFE_ALIAS=${bySafety.SAFE_ALIAS.length} REQUIRES_REVIEW=${bySafety.REQUIRES_REVIEW.length} UNSAFE=${bySafety.UNSAFE.length}`);
}
main();
