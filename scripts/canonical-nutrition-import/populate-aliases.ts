#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeFoodName } from "@/lib/nutrition/canonical-food-search";
import { buildAliasId } from "@/lib/nutrition-import/ids";
import { insertFoodAlias, type FoodAliasRecord } from "./common";
import { openLocalCanonicalDb, type LocalDb } from "./local-db";

/**
 * FASE 3.5 (itens 4/5) — aliases curados, determinísticos, NUNCA gerados
 * por IA. Cada entrada abaixo foi auditada a mao contra um gap REAL
 * encontrado no shadow report da Fase 3
 * (reports/canonical-resolver-comparison.md) e confirmada contra o banco
 * real antes de ser adicionada (o food_id de destino foi consultado
 * diretamente, nunca adivinhado).
 *
 * Regra dura (item 4): nenhum alias remove preparo, cultivar, marca,
 * integral/desnatado, diet/light, com/sem açúcar — cada entrada abaixo e
 * uma reducao de FRASE (ordem natural / termo de ligacao implicito), nunca
 * de um atributo nutricionalmente relevante.
 */

interface AliasRule {
  alias: string;
  canonicalFoodId: string;
  reason: string;
  confidence: FoodAliasRecord["confidence"];
}

const ALIAS_RULES: AliasRule[] = [
  {
    alias: "arroz branco cru",
    canonicalFoodId: "taco:4",
    reason:
      '"Arroz branco" é o nome popular do que a TACO chama "Arroz, tipo 1" (arroz polido comum, sem casca) — termo comprovável no próprio domínio (TACO não usa "branco" na nomenclatura técnica, mas é como a população brasileira se refere a esse produto). Sem alias, "arroz branco" só batia por CONTAINS em pratos compostos que citam "arroz branco" como ingrediente, nunca no alimento simples.',
    confidence: "MANUAL_CURATED",
  },
  {
    alias: "arroz branco cozido",
    canonicalFoodId: "taco:3",
    reason: "Mesmo raciocínio de 'arroz branco cru', na variante cozida — preparo preservado explicitamente na query, nunca removido.",
    confidence: "MANUAL_CURATED",
  },
  {
    alias: "leite integral",
    canonicalFoodId: "taco:458",
    reason:
      'A TACO nomeia como "Leite, de vaca, integral" — a query natural "leite integral" omite "de vaca" (espécie), que em português corrente é o padrão implícito quando não se especifica outro animal (a própria base tem "Leite, búfala, integral" e "Leite, cabra, integral" como entradas SEPARADAS e explicitamente rotuladas). "integral" (o atributo de gordura) é preservado — nunca removido. Sem alias, a ordem "leite, de vaca, integral" nunca virava PREFIX/EXACT contra "leite integral" (a palavra "vaca" no meio quebra o prefixo).',
    confidence: "MANUAL_CURATED",
  },
  {
    alias: "leite desnatado",
    canonicalFoodId: "ibge_pof:7903601:99",
    reason:
      "Mesmo raciocínio de 'leite integral' — POF já nomeia exatamente 'Leite de vaca desnatado' sem qualificador de forma (pó/UHT), o candidato mais limpo pra a busca genérica. 'desnatado' preservado — nunca removido.",
    confidence: "MANUAL_CURATED",
  },
];

async function main() {
  const dbPath = resolve(process.argv[2] ?? "reports/canonical-nutrition-local.sqlite");
  const db: LocalDb = openLocalCanonicalDb(dbPath);

  const results: Array<FoodAliasRecord & { created: boolean; targetName: string | null }> = [];
  for (const rule of ALIAS_RULES) {
    const target = db.prepare("SELECT name FROM canonical_foods WHERE id = ?").get(rule.canonicalFoodId) as { name: string } | undefined;
    if (!target) {
      console.error(`ALIAS REJEITADO — canonical_food_id inexistente no banco: ${rule.canonicalFoodId} (alias "${rule.alias}")`);
      continue;
    }
    const normalizedAlias = normalizeFoodName(rule.alias);
    const record: FoodAliasRecord = {
      id: buildAliasId(rule.canonicalFoodId, normalizedAlias),
      canonicalFoodId: rule.canonicalFoodId,
      alias: rule.alias,
      normalizedAlias,
      aliasType: "search_synonym",
      source: "curated",
      confidence: rule.confidence,
      reason: rule.reason,
    };
    const created = insertFoodAlias(db, record);
    results.push({ ...record, created, targetName: target.name });
  }

  db.close();

  mkdirSync(resolve("reports"), { recursive: true });
  const json = {
    generatedAt: new Date().toISOString(),
    totalRules: ALIAS_RULES.length,
    inserted: results.filter((r) => r.created).length,
    alreadyExisted: results.filter((r) => !r.created).length,
    aliases: results.map((r) => ({
      alias: r.alias,
      canonical_food_id: r.canonicalFoodId,
      target_name: r.targetName,
      source: r.source,
      reason: r.reason,
      confidence: r.confidence,
    })),
  };
  writeFileSync(resolve("reports/canonical-food-aliases.json"), JSON.stringify(json, null, 2));

  const md = [
    "# Aliases curados — Canonical Food Search (Fase 3.5)",
    "",
    `Gerado em: ${json.generatedAt}`,
    `Total: ${json.totalRules} regras, ${json.inserted} inseridas, ${json.alreadyExisted} já existentes (idempotente).`,
    "",
    "| alias | canonical_food_id | destino | confidence | motivo |",
    "|---|---|---|---|---|",
    ...json.aliases.map((a) => `| ${a.alias} | \`${a.canonical_food_id}\` | ${a.target_name} | ${a.confidence} | ${a.reason} |`),
    "",
    "## Categorias rejeitadas nesta rodada (documentado, não implementado)",
    "",
    "- **EXACT_NORMALIZATION em massa (diferenças só de pontuação)**: redundante — `normalizeFoodName` já resolve isso em tempo de busca (a mesma normalização usada para gravar `normalized_name` na importação). Criar uma linha de alias pra cada nome com vírgula (milhares de alimentos TACO/TBCA) não adicionaria cobertura nenhuma, só inflaria a tabela.",
    "- **SAFE_VARIANT em massa (acento/sem acento)**: mesmo motivo — `normalizeFoodName` já remove acento na comparação em tempo real, então uma variante 'sem acento' de um nome já bate igual, sem precisar de alias.",
    "- **Cultivares em massa**: auditado o ground truth de 130 casos (`reports/canonical-search-quality.md`) — não apareceu nenhum caso real onde um cultivar citado numa query não batesse via o ranking normal (prefix/contains já cobre 'banana prata', 'abacaxi pérola' etc.). Não fabricado alias sem gap real comprovado.",
  ].join("\n");
  writeFileSync(resolve("reports/canonical-food-aliases.md"), md);

  console.log(JSON.stringify({ inserted: json.inserted, alreadyExisted: json.alreadyExisted, total: json.totalRules }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
