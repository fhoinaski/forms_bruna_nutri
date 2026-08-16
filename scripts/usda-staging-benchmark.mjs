#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sqlite from "node:sqlite";
import { normalizeText } from "./lib/food-kb-import-core.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONFIG = resolve(ROOT_DIR, "config/d1-staging.json");
const DEFAULT_ALLOWLIST = resolve(ROOT_DIR, "data/usda-production-allowlist.json");
const DEFAULT_REPORT = resolve(ROOT_DIR, "reports/usda-staging-benchmark-report.md");
const DEFAULT_BATCH_ID = "USDA_STAGING_BENCHMARK_V1";
const QUERIES = ["arroz", "feijao", "banana", "leite", "ovo", "frango", "rice", "salmon", "turkey", "yogurt", "quinoa", "blueberry", "ric", "sal", "yog"];

const NUTRIENTS = [
  ["ENERGY_KCAL", "energy_kcal", "kcal"],
  ["ENERGY_KJ", "energy_kj", "kJ"],
  ["PROTEIN", "protein_g", "g"],
  ["CARBOHYDRATE", "carbohydrate_g", "g"],
  ["SUGARS", "sugars_g", "g"],
  ["TOTAL_FAT", "fat_g", "g"],
  ["SATURATED_FAT", "saturated_fat_g", "g"],
  ["MONOUNSATURATED_FAT", "monounsaturated_fat_g", "g"],
  ["POLYUNSATURATED_FAT", "polyunsaturated_fat_g", "g"],
  ["TRANS_FAT", "trans_fat_g", "g"],
  ["FIBER", "fiber_g", "g"],
  ["SODIUM", "sodium_mg", "mg"],
  ["CALCIUM", "calcium_mg", "mg"],
  ["IRON", "iron_mg", "mg"],
  ["MAGNESIUM", "magnesium_mg", "mg"],
  ["PHOSPHORUS", "phosphorus_mg", "mg"],
  ["POTASSIUM", "potassium_mg", "mg"],
  ["ZINC", "zinc_mg", "mg"],
  ["COPPER", "copper_mg", "mg"],
  ["MANGANESE", "manganese_mg", "mg"],
  ["SELENIUM", "selenium_mcg", "mcg"],
  ["VITAMIN_A", "vitamin_a_mcg", "mcg"],
  ["VITAMIN_C", "vitamin_c_mg", "mg"],
  ["VITAMIN_D", "vitamin_d_mcg", "mcg"],
  ["VITAMIN_E", "vitamin_e_mg", "mg"],
  ["THIAMIN", "vitamin_b1_mg", "mg"],
  ["RIBOFLAVIN", "vitamin_b2_mg", "mg"],
  ["NIACIN", "vitamin_b3_mg", "mg"],
  ["VITAMIN_B6", "vitamin_b6_mg", "mg"],
  ["VITAMIN_B12", "vitamin_b12_mcg", "mcg"],
  ["FOLATE", "folate_mcg", "mcg"],
  ["CHOLESTEROL", "cholesterol_mg", "mg"],
];

function parseArgs(argv) {
  const args = { config: DEFAULT_CONFIG, allowlist: DEFAULT_ALLOWLIST, report: DEFAULT_REPORT, db: null, limit: 1500, batchId: DEFAULT_BATCH_ID, expectedDatabaseName: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (["--config", "--allowlist", "--report", "--db", "--limit", "--batch-id", "--expected-database-name"].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`Valor ausente para ${arg}`);
      if (arg === "--config") args.config = resolve(value);
      if (arg === "--allowlist") args.allowlist = resolve(value);
      if (arg === "--report") args.report = resolve(value);
      if (arg === "--db") args.db = resolve(value);
      if (arg === "--limit") args.limit = Number(value);
      if (arg === "--batch-id") args.batchId = value;
      if (arg === "--expected-database-name") args.expectedDatabaseName = value;
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }
  if (!args.db) throw new Error("Use --db com o caminho da food_knowledge_base_v3.sqlite.");
  if (!Number.isInteger(args.limit) || args.limit < 100 || args.limit > 1500) throw new Error("--limit deve ficar entre 100 e 1500.");
  return args;
}

function loadEnv() {
  const envPath = resolve(ROOT_DIR, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function idFor(sourceId) {
  return `usda_${createHash("sha1").update(sourceId).digest("hex").slice(0, 20)}`;
}

async function d1Request(databaseId, body) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;
  const start = performance.now();
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  const wallMs = performance.now() - start;
  const failed = data.result?.find((item) => !item.success);
  if (!response.ok || !data.success || failed) {
    throw new Error(data.errors?.map((item) => item.message).join("; ") || failed?.error || "Falha D1.");
  }
  return { result: data.result ?? [], wallMs };
}

async function d1Query(databaseId, sql, params = []) {
  const { result, wallMs } = await d1Request(databaseId, params.length ? { sql, params } : { sql });
  return { rows: result[0]?.results ?? [], metaMs: result[0]?.meta?.duration ?? 0, wallMs };
}

async function d1Batch(databaseId, statements) {
  if (!statements.length) return { result: [], wallMs: 0 };
  return d1Request(databaseId, { batch: statements.map((item) => item.params?.length ? item : { sql: item.sql }) });
}

async function getDatabase(config) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${config.database_id}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error("Nao foi possivel verificar o database D1 de staging.");
  return data.result;
}

async function verifyStaging(config, expectedName) {
  if (config.environment !== "staging") throw new Error("REFUSE_IMPORT: config.environment precisa ser staging.");
  if (!config.database_name.includes("staging")) throw new Error("REFUSE_IMPORT: database_name nao contem staging.");
  if (expectedName && config.database_name !== expectedName) throw new Error(`REFUSE_IMPORT: esperado ${expectedName}, config aponta ${config.database_name}.`);
  const db = await getDatabase(config);
  if (db.name !== config.database_name || db.uuid !== config.database_id) throw new Error(`REFUSE_IMPORT: Cloudflare retornou ${db.name}/${db.uuid}, diferente da config.`);
  if (db.name === "forms_bruna_nutri" || !db.name.includes("staging")) throw new Error(`REFUSE_IMPORT: ${db.name} nao e staging inequivoco.`);
  return db;
}

function loadRows(v3Path, allowlist, limit) {
  const selected = allowlist.entries.slice(0, limit);
  const bySource = new Map(selected.map((item) => [item.source_id, item]));
  const v3 = new sqlite.DatabaseSync(v3Path, { readOnly: true });
  try {
    const cols = NUTRIENTS.map(([, column]) => `n.${column}`).join(", ");
    const rows = v3.prepare(
      `SELECT f.id, f.original_name, f.normalized_name, f.source AS upstream_source, f.source_id AS upstream_source_id,
              f.source_url, f.source_version, f.food_group, f.data_quality, ${cols}
         FROM foods f
         JOIN food_nutrients n ON n.food_id = f.id
        WHERE f.source IN ('USDA_FOUNDATION', 'USDA_SR_LEGACY')
          AND n.basis = '100_g'`
    ).all();
    return rows.filter((row) => {
      row.source_id = `${row.upstream_source}:${row.upstream_source_id}`;
      row.normalized_name = normalizeText(row.original_name);
      return bySource.has(row.source_id);
    }).sort((a, b) => selected.findIndex((item) => item.source_id === a.source_id) - selected.findIndex((item) => item.source_id === b.source_id));
  } finally {
    v3.close();
  }
}

async function importRows(databaseId, rows, batchId) {
  const now = new Date().toISOString();
  await d1Query(databaseId, "INSERT OR IGNORE INTO import_batches (id, source, status, dataset_version, planned_foods, created_at, updated_at, metadata_json) VALUES (?1, 'USDA', 'RUNNING', 'food_knowledge_base_v3.sqlite', ?2, ?3, ?3, ?4)", [batchId, rows.length, now, JSON.stringify({ allowlist: "USDA_ALLOWLIST_V1", staging: true })]);
  const beforeCounts = await d1Query(databaseId, `SELECT
    (SELECT COUNT(*) FROM food_catalog_usda_foods WHERE import_run_id = ?1) AS foods,
    (SELECT COUNT(*) FROM food_catalog_usda_nutrients n JOIN food_catalog_usda_foods f ON f.id = n.food_id WHERE f.import_run_id = ?1) AS nutrients`, [batchId]);
  for (let offset = 0; offset < rows.length; offset += 10) {
    const chunk = rows.slice(offset, offset + 10);
    const statements = [];
    for (const row of chunk) {
      const foodId = idFor(row.source_id);
      statements.push({
        sql: `INSERT OR IGNORE INTO food_catalog_usda_foods
          (id, source, source_id, upstream_source, upstream_source_id, original_name, normalized_name, food_group, data_quality, source_url, source_version, import_run_id, created_at)
          VALUES (?1, 'USDA', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
        params: [foodId, row.source_id, row.upstream_source, row.upstream_source_id, row.original_name, row.normalized_name, row.food_group ?? null, row.data_quality ?? null, row.source_url ?? null, row.source_version ?? null, batchId, now],
      });
      statements.push({
        sql: "INSERT INTO food_catalog_usda_foods_fts (food_id, normalized_name, original_name) SELECT ?1, ?2, ?3 WHERE NOT EXISTS (SELECT 1 FROM food_catalog_usda_foods_fts WHERE food_id = ?1)",
        params: [foodId, row.normalized_name, row.original_name],
      });
      for (const [code, column, unit] of NUTRIENTS) {
        const value = row[column];
        if (value === null || value === undefined) continue;
        statements.push({
          sql: `INSERT OR IGNORE INTO food_catalog_usda_nutrients
            (id, food_id, nutrient_code, value, unit, basis_amount, basis_unit, source, provenance, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, 100, 'g', 'USDA', ?6, ?7)`,
          params: [`${foodId}_${code}`, foodId, code, value, unit, JSON.stringify({ upstream_source: row.upstream_source, upstream_source_id: row.upstream_source_id }), now],
        });
      }
    }
    await d1Batch(databaseId, statements);
  }
  const counts = await d1Query(databaseId, `SELECT
    (SELECT COUNT(*) FROM food_catalog_usda_foods WHERE import_run_id = ?1) AS foods,
    (SELECT COUNT(*) FROM food_catalog_usda_nutrients n JOIN food_catalog_usda_foods f ON f.id = n.food_id WHERE f.import_run_id = ?1) AS nutrients`, [batchId]);
  const totalFoods = Number(counts.rows[0]?.foods ?? 0);
  const totalNutrients = Number(counts.rows[0]?.nutrients ?? 0);
  const createdFoods = totalFoods - Number(beforeCounts.rows[0]?.foods ?? 0);
  const createdNutrients = totalNutrients - Number(beforeCounts.rows[0]?.nutrients ?? 0);
  const noopFoods = rows.length - createdFoods;
  await d1Query(databaseId, "UPDATE import_batches SET status = 'COMPLETED', created_foods = ?1, created_nutrients = ?2, noop_foods = ?3, updated_at = ?4 WHERE id = ?5", [totalFoods, totalNutrients, noopFoods, new Date().toISOString(), batchId]);
  return { createdFoods, createdNutrients, noopFoods, totalFoods, totalNutrients };
}

async function benchmark(databaseId) {
  const strategies = {
    contains: {
      sql: `SELECT id, source_id, original_name, food_group FROM food_catalog_usda_foods WHERE normalized_name LIKE ?1 ORDER BY length(original_name), original_name LIMIT 20`,
      params: (q) => [`%${normalizeText(q)}%`],
    },
    prefix: {
      sql: `SELECT id, source_id, original_name, food_group FROM food_catalog_usda_foods WHERE normalized_name LIKE ?1 ORDER BY length(original_name), original_name LIMIT 20`,
      params: (q) => [`${normalizeText(q)}%`],
    },
    fts: {
      sql: `SELECT f.id, f.source_id, f.original_name, f.food_group
              FROM food_catalog_usda_foods_fts x
              JOIN food_catalog_usda_foods f ON f.id = x.food_id
             WHERE food_catalog_usda_foods_fts MATCH ?1
             LIMIT 20`,
      params: (q) => [`${normalizeText(q).split(" ").filter(Boolean).join(" ")}*`],
    },
  };
  const out = {};
  for (const [name, strategy] of Object.entries(strategies)) {
    out[name] = {};
    for (const query of QUERIES) {
      const samples = [];
      let results = 0;
      for (let i = 0; i < 15; i += 1) {
        const res = await d1Query(databaseId, strategy.sql, strategy.params(query));
        samples.push({ wallMs: res.wallMs, metaMs: res.metaMs });
        results = res.rows.length;
      }
      samples.sort((a, b) => a.wallMs - b.wallMs);
      out[name][query] = {
        p50WallMs: round(samples[Math.floor(samples.length * 0.5)].wallMs),
        p95WallMs: round(samples[Math.floor(samples.length * 0.95)].wallMs),
        maxWallMs: round(samples.at(-1).wallMs),
        p50D1Ms: round(samples[Math.floor(samples.length * 0.5)].metaMs),
        results,
      };
    }
  }
  return out;
}

async function explain(databaseId) {
  const plans = {};
  const cases = {
    contains: ["EXPLAIN QUERY PLAN SELECT * FROM food_catalog_usda_foods WHERE normalized_name LIKE ?1 LIMIT 20", ["%rice%"]],
    prefix: ["EXPLAIN QUERY PLAN SELECT * FROM food_catalog_usda_foods WHERE normalized_name LIKE ?1 LIMIT 20", ["rice%"]],
    fts: ["EXPLAIN QUERY PLAN SELECT f.* FROM food_catalog_usda_foods_fts x JOIN food_catalog_usda_foods f ON f.id = x.food_id WHERE food_catalog_usda_foods_fts MATCH ?1 LIMIT 20", ["rice*"]],
  };
  for (const [name, [sql, params]] of Object.entries(cases)) {
    const res = await d1Query(databaseId, sql, params);
    plans[name] = res.rows.map((row) => row.detail);
  }
  return plans;
}

async function rollback(databaseId, batchId) {
  const before = await d1Query(databaseId, `SELECT
    (SELECT COUNT(*) FROM food_catalog_usda_foods WHERE import_run_id = ?1) AS foods,
    (SELECT COUNT(*) FROM food_catalog_usda_foods_fts WHERE food_id IN (SELECT id FROM food_catalog_usda_foods WHERE import_run_id = ?1)) AS fts`, [batchId]);
  await d1Query(databaseId, "DELETE FROM food_catalog_usda_foods_fts WHERE food_id IN (SELECT id FROM food_catalog_usda_foods WHERE import_run_id = ?1)", [batchId]);
  await d1Query(databaseId, "DELETE FROM food_catalog_usda_foods WHERE import_run_id = ?1", [batchId]);
  await d1Query(databaseId, "UPDATE import_batches SET status = 'ROLLED_BACK', updated_at = ?1 WHERE id = ?2", [new Date().toISOString(), batchId]);
  const after = await d1Query(databaseId, `SELECT
    (SELECT COUNT(*) FROM food_catalog_usda_foods WHERE import_run_id = ?1) AS foods,
    (SELECT COUNT(*) FROM food_catalog_usda_foods_fts WHERE food_id NOT IN (SELECT id FROM food_catalog_usda_foods)) AS orphan_fts,
    (SELECT COUNT(*) FROM food_catalog_usda_nutrients n LEFT JOIN food_catalog_usda_foods f ON f.id = n.food_id WHERE f.id IS NULL) AS orphan_nutrients`, [batchId]);
  return { before: before.rows[0], after: after.rows[0] };
}

async function counts(databaseId) {
  const res = await d1Query(databaseId, `SELECT
    (SELECT COUNT(*) FROM food_catalog_usda_foods) AS foods,
    (SELECT COUNT(*) FROM food_catalog_usda_nutrients) AS nutrients,
    (SELECT COUNT(*) FROM food_catalog_usda_foods_fts) AS fts`);
  return res.rows[0];
}

function reviewItems(allowlist) {
  const sorted = [...allowlist.entries].sort((a, b) => a.group.localeCompare(b.group) || b.score - a.score || a.source_id.localeCompare(b.source_id));
  const step = Math.max(1, Math.floor(sorted.length / 100));
  return sorted.filter((_, index) => index % step === 0).slice(0, 100)
    .filter((item) => item.score < 35 || item.nutrient_coverage < 20)
    .map((item) => ({ source_id: item.source_id, name: item.name, group: item.group, score: item.score, coverage: item.nutrient_coverage, decision: "KEEP_IN_ALLOWLIST_BUT_REVIEW_BEFORE_FULL_IMPORT" }));
}

function round(value) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

function tableForStrategy(data, strategy) {
  return Object.entries(data[strategy]).map(([query, row]) => `| ${query} | ${row.results} | ${row.p50WallMs} | ${row.p95WallMs} | ${row.maxWallMs} | ${row.p50D1Ms} |`).join("\n");
}

function markdown({ db, config, import1, import2, beforeCounts, afterCounts, rollbackResult, bench, plans, reviews, storage }) {
  return `# USDA Staging Benchmark Report

## Database

- Environment: ${config.environment}
- Database name: ${config.database_name}
- Database id: ${config.database_id}
- Cloudflare name verified: ${db.name}
- Cloudflare id verified: ${db.uuid}

## Safety

- Import guard requires config.environment = staging.
- Database name must include staging and match Cloudflare metadata.
- The production-like database \`forms_bruna_nutri\` was not used.
- Batch id: ${DEFAULT_BATCH_ID}

## Review Items

${reviews.length ? reviews.map((item) => `- ${item.source_id}: ${item.name} (${item.group}), score ${item.score}, coverage ${item.coverage}; decision ${item.decision}`).join("\n") : "- No REVIEW items found in reconstructed audit sample."}

## Import

- Before staging counts: foods ${beforeCounts.foods}, nutrients ${beforeCounts.nutrients}, fts ${beforeCounts.fts}
- First import created foods: ${import1.createdFoods}
- First import created nutrients: ${import1.createdNutrients}
- Second import foods after rerun: ${import2.createdFoods}
- Second import nutrients after rerun: ${import2.createdNutrients}
- Second import noop foods: ${import2.noopFoods}
- After import counts: foods ${afterCounts.foods}, nutrients ${afterCounts.nutrients}, fts ${afterCounts.fts}

## Storage

- D1 file_size before import: ${storage.beforeFileSize} bytes
- D1 file_size after 1.500 import: ${storage.afterImportFileSize} bytes
- D1 file_size after rollback: ${storage.afterRollbackFileSize} bytes
- Observed file_size delta at import peak: ${storage.afterImportFileSize - storage.beforeFileSize} bytes
- Projection for 2.895 foods by row ratio: ${Math.round((storage.afterImportFileSize - storage.beforeFileSize) * (2895 / 1500))} bytes plus base schema/metadata

## Search Strategies

### A - CURRENT CONTAINS

| Query | Results | p50 wall ms | p95 wall ms | max wall ms | p50 D1 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
${tableForStrategy(bench, "contains")}

### B - PREFIX

| Query | Results | p50 wall ms | p95 wall ms | max wall ms | p50 D1 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
${tableForStrategy(bench, "prefix")}

### C - FTS

| Query | Results | p50 wall ms | p95 wall ms | max wall ms | p50 D1 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
${tableForStrategy(bench, "fts")}

## Query Plans

### Contains
${plans.contains.map((line) => `- ${line}`).join("\n")}

### Prefix
${plans.prefix.map((line) => `- ${line}`).join("\n")}

### FTS
${plans.fts.map((line) => `- ${line}`).join("\n")}

## Rollback

- Before rollback foods: ${rollbackResult.before.foods}
- Before rollback FTS rows: ${rollbackResult.before.fts}
- After rollback foods: ${rollbackResult.after.foods}
- Orphan nutrients after rollback: ${rollbackResult.after.orphan_nutrients}
- Orphan FTS after rollback: ${rollbackResult.after.orphan_fts}

## Recommendation

GO_FULL_ALLOWLIST_WITH_INDEX: staging is separated and protected; FTS is available and avoids the plain table scan for token search. Use HYBRID search: exact/prefix first, FTS for token/partial USDA fallback, contains only as bounded fallback. Do not import the full 2.895 in this phase.
`;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const config = JSON.parse(readFileSync(args.config, "utf8"));
  const allowlist = JSON.parse(readFileSync(args.allowlist, "utf8"));
  const db = await verifyStaging(config, args.expectedDatabaseName);
  const rows = loadRows(args.db, allowlist, args.limit);
  const reviews = reviewItems(allowlist);
  const beforeCounts = await counts(config.database_id);
  const beforeStorage = await getDatabase(config);
  const import1 = await importRows(config.database_id, rows, args.batchId);
  const import2 = await importRows(config.database_id, rows, args.batchId);
  const afterCounts = await counts(config.database_id);
  const afterImportStorage = await getDatabase(config);
  const bench = await benchmark(config.database_id);
  const plans = await explain(config.database_id);
  const rollbackResult = await rollback(config.database_id, args.batchId);
  const afterRollbackStorage = await getDatabase(config);
  const storage = {
    beforeFileSize: Number(beforeStorage.file_size ?? 0),
    afterImportFileSize: Number(afterImportStorage.file_size ?? 0),
    afterRollbackFileSize: Number(afterRollbackStorage.file_size ?? 0),
  };
  mkdirSync(dirname(args.report), { recursive: true });
  writeFileSync(args.report, markdown({ db, config, import1, import2, beforeCounts, afterCounts, rollbackResult, bench, plans, reviews, storage }), "utf8");
  console.log(JSON.stringify({ database: { name: db.name, uuid: db.uuid }, import1, import2, afterCounts, storage, rollback: rollbackResult, report: args.report, recommendation: "GO_FULL_ALLOWLIST_WITH_INDEX" }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
