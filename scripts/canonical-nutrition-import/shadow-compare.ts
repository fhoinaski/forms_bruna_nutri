#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { searchFoods } from "@/lib/nutrition/food-catalog";
import { resolveCanonicalFood } from "@/lib/nutrition/canonical-food-resolver";
import { localCanonicalExecutor } from "./local-executor";

/**
 * FASE 3 (item 13) — Shadow comparison: resolver ATIVO (searchFoods, TACO+
 * COMPLEMENTARY — o catalogo local em memoria, sem D1) vs resolver
 * CANONICO (TBCA+TACO+POF reais, banco local). NUNCA muda producao —
 * so le e compara, gera relatorio.
 *
 * Escopo do resolver ATIVO restrito a sources: ["TACO","COMPLEMENTARY"]
 * porque CUSTOM/MANUFACTURER/USDA exigem credenciais D1 reais nao
 * disponiveis neste ambiente — TACO+COMPLEMENTARY e o catalogo local
 * padrao (sempre ligado, sem rede), entao a comparacao continua
 * representativa do comportamento central do resolver atual.
 */

const MANDATORY_QUERIES = [
  "arroz integral cozido",
  "arroz branco",
  "feijão preto cozido",
  "ovo cozido",
  "ovo mexido",
  "frango grelhado",
  "peito de frango",
  "tilápia assada",
  "banana",
  "banana prata",
  "mamão",
  "abacate",
  "leite integral",
  "leite desnatado",
  "milho cru",
  "milho cozido",
  "milho grelhado",
  "milho assado",
];

// Item 14 — casos reais adicionais encontrados na TBCA (nunca fabricados):
// in natura, preparo simples, preparacao composta, produto industrializado,
// alimento regional/biodiversidade, varias medidas caseiras, nomes
// semelhantes, cultivar/variedade.
const TBCA_REAL_CASES = [
  "abacaxi perola", // biodiversidade: cultivar/variedade real (Ananas Comosus var. Perola)
  "achocolatado em po dietetico", // produto industrializado (composicao_informacao_estatistica_produtos)
  "azeite de dende", // in natura / processado simples
  "peixe agua doce tilapia file cru", // preparo simples, com medidas caseiras
  "arroz de coco", // preparacao composta (prato pronto)
  "yakissoba", // preparacao composta / prato pronto, nome regional
];

async function currentResolverTop(query: string) {
  const results = await searchFoods({ query, sources: ["TACO", "COMPLEMENTARY"], limit: 5 });
  if (!results.length) return { status: "NOT_FOUND", top: null as null | { name: string; source: string; matchRank: number | undefined } };
  const top = results[0];
  return { status: top.matchRank !== undefined && top.matchRank <= 1 ? "CONFIDENT" : "NEEDS_REVIEW", top: { name: top.name, source: top.ref.source, matchRank: top.matchRank } };
}

function namesLikelyMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const na = a.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const nb = b.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return na.includes(nb) || nb.includes(na);
}

async function main() {
  const { db, executor } = localCanonicalExecutor("reports/canonical-nutrition-local.sqlite");
  const queries = [...MANDATORY_QUERIES, ...TBCA_REAL_CASES];
  const rows = [];

  for (const query of queries) {
    const current = await currentResolverTop(query);
    const canonical = await resolveCanonicalFood(query, { db: executor, limit: 8 });
    const canonicalTopName = canonical.selected?.name ?? canonical.candidates[0]?.name;
    const sameFoodLikely = namesLikelyMatch(current.top?.name, canonicalTopName);

    rows.push({
      query,
      current: { status: current.status, topName: current.top?.name ?? null, topSource: current.top?.source ?? null, matchRank: current.top?.matchRank ?? null },
      canonical: {
        status: canonical.status,
        topName: canonicalTopName ?? null,
        topSource: canonical.selected?.source ?? canonical.candidates[0]?.source ?? null,
        score: canonical.selected?.score ?? canonical.candidates[0]?.score ?? null,
        candidateCount: canonical.candidates.length,
        preparation: canonical.preparation,
      },
      sameFoodLikely,
      improvement: current.status === "NOT_FOUND" && canonical.status !== "NOT_FOUND"
        ? "CANONICAL_FOUND_MORE"
        : current.status !== "NOT_FOUND" && canonical.status === "NOT_FOUND"
          ? "CANONICAL_FOUND_LESS"
          : !sameFoodLikely && current.top && canonicalTopName
            ? "DIFFERENT_TOP_MATCH"
            : "CONSISTENT",
    });
  }

  db.close();

  mkdirSync(resolve("reports"), { recursive: true });
  const json = { generatedAt: new Date().toISOString(), totalQueries: queries.length, rows };
  writeFileSync(resolve("reports/canonical-resolver-comparison.json"), JSON.stringify(json, null, 2));

  const summary = {
    CONSISTENT: rows.filter((r) => r.improvement === "CONSISTENT").length,
    CANONICAL_FOUND_MORE: rows.filter((r) => r.improvement === "CANONICAL_FOUND_MORE").length,
    CANONICAL_FOUND_LESS: rows.filter((r) => r.improvement === "CANONICAL_FOUND_LESS").length,
    DIFFERENT_TOP_MATCH: rows.filter((r) => r.improvement === "DIFFERENT_TOP_MATCH").length,
  };

  const md = [
    "# Comparação: resolver ativo (TACO+COMPLEMENTARY local) vs resolver canônico (TBCA+TACO+POF reais)",
    "",
    `Gerado em: ${json.generatedAt}`,
    "",
    `Total de queries: ${queries.length}`,
    "",
    "## Resumo",
    "",
    `- CONSISTENT (mesmo alimento provável): ${summary.CONSISTENT}`,
    `- CANONICAL_FOUND_MORE (canônico achou, atual não): ${summary.CANONICAL_FOUND_MORE}`,
    `- CANONICAL_FOUND_LESS (atual achou, canônico não): ${summary.CANONICAL_FOUND_LESS}`,
    `- DIFFERENT_TOP_MATCH (os dois acharam algo, mas alimentos diferentes): ${summary.DIFFERENT_TOP_MATCH}`,
    "",
    "## Detalhe por query",
    "",
    "| query | atual (status/top/fonte) | canônico (status/top/fonte/score) | prep | resultado |",
    "|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.query} | ${r.current.status} / ${r.current.topName ?? "—"} / ${r.current.topSource ?? "—"} | ${r.canonical.status} / ${r.canonical.topName ?? "—"} / ${r.canonical.topSource ?? "—"} / ${r.canonical.score?.toFixed?.(1) ?? "—"} | ${r.canonical.preparation ?? "—"} | **${r.improvement}** |`
    ),
  ].join("\n");
  writeFileSync(resolve("reports/canonical-resolver-comparison.md"), md);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
