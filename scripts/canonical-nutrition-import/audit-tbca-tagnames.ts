#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { iterateTbcaCollectionRecords, parseTbcaRawRecord } from "@/lib/nutrition-import/tbca-json-stream";

/**
 * FASE 2 (4) — auditoria real dos tagnames da TBCA (composicao_informacao_
 * estatistica + _produtos), direto do arquivo via streaming (nunca
 * full-load). Groundtruth para revisar/corrigir TBCA_STATS_TAGNAME_MAP em
 * lib/nutrition-import/nutrient-mapping.ts, que antes desta auditoria
 * assumia o padrao INFOODS publicado sem confirmar cada tagname contra o
 * dado real.
 */
interface StatsNutrient {
  nutrient_id: string;
  name?: string | null;
  tagname?: string | null;
  unit: string;
}
interface StatsFood {
  source_food_id: string;
  name: string;
  nutrients: StatsNutrient[];
}

async function main() {
  const targets = ["composicao_informacao_estatistica", "composicao_informacao_estatistica_produtos"] as const;
  const byTagname = new Map<
    string,
    { tagname: string; names: Set<string>; units: Set<string>; nutrientIds: Set<string>; occurrences: number; examples: string[] }
  >();

  for await (const rec of iterateTbcaCollectionRecords("data-local/tbca_completa.json", targets)) {
    const food = parseTbcaRawRecord<StatsFood>(rec);
    for (const nutrient of food.nutrients) {
      const tagname = nutrient.tagname ?? "(sem tagname)";
      let entry = byTagname.get(tagname);
      if (!entry) {
        entry = { tagname, names: new Set(), units: new Set(), nutrientIds: new Set(), occurrences: 0, examples: [] };
        byTagname.set(tagname, entry);
      }
      entry.occurrences += 1;
      if (nutrient.name) entry.names.add(nutrient.name);
      entry.units.add(nutrient.unit);
      entry.nutrientIds.add(nutrient.nutrient_id);
      if (entry.examples.length < 2) entry.examples.push(`${food.name} (${food.source_food_id})`);
    }
  }

  const result = Array.from(byTagname.values())
    .map((e) => ({
      tagname: e.tagname,
      names: Array.from(e.names),
      units: Array.from(e.units),
      nutrientIds: Array.from(e.nutrientIds),
      occurrences: e.occurrences,
      examples: e.examples,
    }))
    .sort((a, b) => b.occurrences - a.occurrences);

  writeFileSync(resolve("reports/tbca-tagname-audit.json"), JSON.stringify({ generatedAt: new Date().toISOString(), distinctTagnames: result.length, tagnames: result }, null, 2));
  console.log(JSON.stringify({ distinctTagnames: result.length, total: result.reduce((s, r) => s + r.occurrences, 0) }, null, 2));
  console.log(result.map((r) => `${r.tagname}\t${r.names.join("|")}\t${r.units.join(",")}\t${r.occurrences}`).join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
