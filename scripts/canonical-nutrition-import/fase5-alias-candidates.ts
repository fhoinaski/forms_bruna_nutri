import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * FASE 5 (item 12) — propoe candidatos de alias A PARTIR DE ERROS REAIS
 * observados no shadow (reports/fase5-different-top-audit.json e
 * reports/fase5-canonical-found-more-audit.json), gerados por
 * fase5-shadow-validation.ts. NUNCA insere nada automaticamente — so
 * escreve reports/canonical-alias-candidates.md pra revisao humana.
 */
function main() {
  const differentTop = JSON.parse(readFileSync(resolve("reports/fase5-different-top-audit.json"), "utf8")) as Array<Record<string, unknown>>;
  const foundMore = JSON.parse(readFileSync(resolve("reports/fase5-canonical-found-more-audit.json"), "utf8")) as Array<Record<string, unknown>>;

  interface Candidate {
    query: string;
    currentResult: string;
    canonicalResult: string;
    proposedAlias: string;
    reason: string;
    confidence: "high" | "medium" | "low";
  }

  const candidates: Candidate[] = [];

  // BAD_CURRENT_MATCH: o resolver atual errou o alvo mas o canonico tem
  // exatamente o nome certo — candidato forte de alias curado (proposta
  // seria pro FUTURO catalogo canonico reconhecer melhor essa forma
  // natural, nao pro resolver atual).
  for (const row of differentTop) {
    if (row.heuristicCategory === "BAD_CURRENT_MATCH" && row.canonicalName) {
      candidates.push({
        query: String(row.query),
        currentResult: String(row.currentName ?? "(nenhum)"),
        canonicalResult: String(row.canonicalName),
        proposedAlias: String(row.query),
        reason: "Resolver atual escolheu um alimento sem sobreposição de termos com a query; canônico achou um nome mais próximo — candidato a alias pro canônico reconhecer essa forma de digitar direto.",
        confidence: "medium",
      });
    }
  }

  // CANONICAL_FOUND_MORE onde a query é curta/natural (<= 3 palavras) e o
  // canonico achou via PREFIX/CONTAINS (nao EXACT/ALIAS) — sinal de que um
  // alias exato economizaria o fallback de ranking.
  for (const row of foundMore) {
    const query = String(row.query ?? "");
    const wordCount = query.split(/\s+/).length;
    if (wordCount <= 4 && (row.canonicalMatchMethod === "PREFIX" || row.canonicalMatchMethod === "CONTAINS") && (row.canonicalScore as number) >= 60) {
      candidates.push({
        query,
        currentResult: "NOT_FOUND",
        canonicalResult: String(row.canonicalName ?? ""),
        proposedAlias: query,
        reason: `Resolver atual não achou nada; canônico achou via ${row.canonicalMatchMethod} (score ${row.canonicalScore}) — query curta e natural, boa candidata a alias exato em vez de depender de ranking fuzzy.`,
        confidence: (row.canonicalScore as number) >= 90 ? "high" : "medium",
      });
    }
  }

  const dedup = new Map<string, Candidate>();
  for (const c of candidates) if (!dedup.has(c.query)) dedup.set(c.query, c);
  const finalCandidates = Array.from(dedup.values()).slice(0, 80);

  const md = [
    "# Canonical Alias Candidates — Fase 5 (item 12)",
    "",
    `Gerado em: ${new Date().toISOString()}`,
    "",
    "Candidatos derivados SOMENTE de erros/lacunas reais observados no shadow",
    "dataset (nunca inventados). Nenhum foi inserido automaticamente — cada",
    "linha precisa de revisão humana antes de virar uma linha real em",
    "`food_aliases`.",
    "",
    `Total de candidatos: ${finalCandidates.length}`,
    "",
    "| query | current result | canonical result | proposed alias | confidence | reason |",
    "|---|---|---|---|---|---|",
    ...finalCandidates.map((c) => `| ${c.query} | ${c.currentResult} | ${c.canonicalResult} | ${c.proposedAlias} | ${c.confidence} | ${c.reason} |`),
  ].join("\n");

  mkdirSync(resolve("reports"), { recursive: true });
  writeFileSync(resolve("reports/canonical-alias-candidates.md"), md);
  writeFileSync(resolve("reports/canonical-alias-candidates.json"), JSON.stringify(finalCandidates, null, 2));
  console.log(`${finalCandidates.length} candidatos escritos em reports/canonical-alias-candidates.md`);
}
main();
