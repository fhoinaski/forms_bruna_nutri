#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openLocalCanonicalDb, type LocalDb } from "./local-db";

/**
 * FASE 2 (1/2) — inventario real de nutrientes por fonte, construido a
 * partir do banco local reproduzivel da importacao completa (nunca das
 * nutrient_definitions declaradas no cabeçalho — "nao confiar apenas nas
 * definicoes declaradas"). Cobre tanto food_nutrient_values (TACO/POF/TBCA
 * principal+biodiversidade+produtos) quanto nutrient_statistics (TBCA
 * estatistica+produtos, que usa tagname em vez de slug).
 */

interface InventoryRow {
  source: string;
  source_nutrient_id: string;
  example_name: string | null;
  unit: string;
  raw_unit: string;
  basis: string;
  nutrient_code: string | null;
  occurrences: number;
  distinct_foods: number;
  example_foods: string[];
}

function rows(db: LocalDb, sql: string): Record<string, unknown>[] {
  return db.prepare(sql).all();
}

function buildValueInventory(db: LocalDb): InventoryRow[] {
  // Sem filtro de portion_id de proposito: "occurrences" conta TODAS as
  // linhas desse nutriente (valor base per-100g + valores escalonados por
  // medida caseira), para bater com o total que validate.ts reporta em
  // unmappedNutrientCodes. distinct_foods usa so o valor base (1 por
  // alimento) para nao inflar a contagem de alimentos afetados.
  const grouped = rows(
    db,
    `SELECT v.source, v.source_nutrient_id, v.unit, v.raw_unit, v.basis, v.nutrient_code,
            COUNT(*) AS occurrences,
            COUNT(DISTINCT CASE WHEN v.portion_id IS NULL THEN v.canonical_food_id END) AS distinct_foods
       FROM food_nutrient_values v
      GROUP BY v.source, v.source_nutrient_id, v.unit, v.raw_unit, v.basis, v.nutrient_code
      ORDER BY occurrences DESC`
  );

  return grouped.map((row) => {
    const examples = rows(
      db,
      `SELECT f.name, v.value, v.status FROM food_nutrient_values v
         JOIN canonical_foods f ON f.id = v.canonical_food_id
        WHERE v.source = '${String(row.source).replace(/'/g, "''")}'
          AND v.source_nutrient_id = '${String(row.source_nutrient_id).replace(/'/g, "''")}'
          AND v.portion_id IS NULL
        LIMIT 3`
    );
    return {
      source: String(row.source),
      source_nutrient_id: String(row.source_nutrient_id),
      example_name: (examples[0]?.name as string) ?? null,
      unit: String(row.unit),
      raw_unit: String(row.raw_unit),
      basis: String(row.basis),
      nutrient_code: (row.nutrient_code as string | null) ?? null,
      occurrences: Number(row.occurrences),
      distinct_foods: Number(row.distinct_foods),
      example_foods: examples.map((e) => `${e.name} (${e.value ?? "null"}, ${e.status})`),
    };
  });
}

function buildStatisticsInventory(db: LocalDb): InventoryRow[] {
  const grouped = rows(
    db,
    `SELECT s.source, s.source_nutrient_id, s.source_tagname, s.nutrient_code,
            COUNT(*) AS occurrences, COUNT(DISTINCT s.canonical_food_id) AS distinct_foods
       FROM nutrient_statistics s
      GROUP BY s.source, s.source_nutrient_id, s.source_tagname, s.nutrient_code
      ORDER BY occurrences DESC`
  );
  return grouped.map((row) => {
    const examples = rows(
      db,
      `SELECT f.name, s.mean_value, s.mean_status FROM nutrient_statistics s
         JOIN canonical_foods f ON f.id = s.canonical_food_id
        WHERE s.source_nutrient_id = '${String(row.source_nutrient_id).replace(/'/g, "''")}'
        LIMIT 3`
    );
    return {
      source: String(row.source),
      source_nutrient_id: String(row.source_nutrient_id),
      example_name: (examples[0]?.name as string) ?? null,
      unit: "n/a", // nutrient_statistics nao guarda unit propria (herdada do par em food_nutrient_values quando existir)
      raw_unit: (row.source_tagname as string | null) ?? "n/a",
      basis: "per_100g_edible_portion",
      nutrient_code: (row.nutrient_code as string | null) ?? null,
      occurrences: Number(row.occurrences),
      distinct_foods: Number(row.distinct_foods),
      example_foods: examples.map((e) => `${e.name} (${e.mean_value ?? "null"}, ${e.mean_status})`),
    };
  });
}

function toMarkdown(title: string, inventory: InventoryRow[]): string {
  const lines = [`# ${title}`, "", `Total de linhas de inventario: ${inventory.length}`, ""];
  lines.push("| source | source_nutrient_id | unit (raw) | basis | nutrient_code | occurrences | distinct_foods | exemplo |");
  lines.push("|---|---|---|---|---|---:|---:|---|");
  for (const row of inventory) {
    lines.push(
      `| ${row.source} | \`${row.source_nutrient_id}\` | ${row.unit} (${row.raw_unit}) | ${row.basis} | ${row.nutrient_code ?? "—"} | ${row.occurrences} | ${row.distinct_foods} | ${row.example_foods[0] ?? ""} |`
    );
  }
  return lines.join("\n");
}

async function main() {
  const dbPath = resolve(process.argv[2] ?? "reports/canonical-nutrition-local.sqlite");
  const db = openLocalCanonicalDb(dbPath);

  const valueInventory = buildValueInventory(db);
  const statsInventory = buildStatisticsInventory(db);
  const unmappedValues = valueInventory.filter((r) => r.nutrient_code === null).sort((a, b) => b.occurrences - a.occurrences);
  const unmappedStats = statsInventory.filter((r) => r.nutrient_code === null).sort((a, b) => b.occurrences - a.occurrences);

  db.close();

  mkdirSync(resolve("reports"), { recursive: true });

  const fullInventoryJson = { generatedAt: new Date().toISOString(), foodNutrientValues: valueInventory, nutrientStatistics: statsInventory };
  writeFileSync(resolve("reports/nutrient-full-inventory.json"), JSON.stringify(fullInventoryJson, null, 2));

  const unmappedJson = {
    generatedAt: new Date().toISOString(),
    summary: {
      unmappedValueRows: unmappedValues.length,
      unmappedValueOccurrences: unmappedValues.reduce((s, r) => s + r.occurrences, 0),
      unmappedStatsRows: unmappedStats.length,
      unmappedStatsOccurrences: unmappedStats.reduce((s, r) => s + r.occurrences, 0),
    },
    foodNutrientValues: unmappedValues,
    nutrientStatistics: unmappedStats,
  };
  writeFileSync(resolve("reports/nutrient-unmapped-inventory.json"), JSON.stringify(unmappedJson, null, 2));

  const md = [
    "# Inventario de nutrientes unmapped — Canonical Nutrition Data Layer",
    "",
    `Gerado em: ${unmappedJson.generatedAt}`,
    "",
    `- food_nutrient_values unmapped: ${unmappedJson.summary.unmappedValueRows} combinacoes distintas, ${unmappedJson.summary.unmappedValueOccurrences} ocorrencias`,
    `- nutrient_statistics unmapped: ${unmappedJson.summary.unmappedStatsRows} combinacoes distintas, ${unmappedJson.summary.unmappedStatsOccurrences} ocorrencias`,
    "",
    toMarkdown("food_nutrient_values (base, sem porcao) — unmapped por impacto", unmappedValues),
    "",
    toMarkdown("nutrient_statistics (TBCA estatistica/produtos) — unmapped por impacto", unmappedStats),
  ].join("\n");
  writeFileSync(resolve("reports/nutrient-unmapped-inventory.md"), md);

  console.log(
    JSON.stringify(
      {
        valueInventoryRows: valueInventory.length,
        statsInventoryRows: statsInventory.length,
        unmappedValueRows: unmappedValues.length,
        unmappedValueOccurrences: unmappedJson.summary.unmappedValueOccurrences,
        unmappedStatsRows: unmappedStats.length,
        unmappedStatsOccurrences: unmappedJson.summary.unmappedStatsOccurrences,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
