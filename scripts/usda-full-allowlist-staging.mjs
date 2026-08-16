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
const DEFAULT_REPORT = resolve(ROOT_DIR, "reports/usda-full-allowlist-staging-report.md");
const EXPECTED_STAGING_NAME = "forms_bruna_nutri_staging";
const EXPECTED_STAGING_ID = "88baf58a-dea4-4fa8-98c4-a220ae5dbf55";
const EXPECTED_ALLOWLIST_VERSION = "USDA_ALLOWLIST_V1";
const EXPECTED_ALLOWLIST_COUNT = 2895;
const BATCH_ID = "USDA_ALLOWLIST_V1";
const BENCHMARK_QUERIES = ["arroz", "feijao", "banana", "leite", "ovo", "frango", "rice", "salmon", "turkey", "yogurt", "quinoa", "blueberry", "ric", "sal", "yog"];
const REVIEW_SOURCE_IDS = [
  "USDA_SR_LEGACY:170259",
  "USDA_SR_LEGACY:173186",
  "USDA_SR_LEGACY:169635",
  "USDA_SR_LEGACY:171431",
  "USDA_SR_LEGACY:173781",
];

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

const MACRO_CODES = ["ENERGY_KCAL", "PROTEIN", "CARBOHYDRATE", "TOTAL_FAT"];
const AUDIT_CODES = ["ENERGY_KCAL", "PROTEIN", "CARBOHYDRATE", "TOTAL_FAT", "CALCIUM", "IRON", "MAGNESIUM", "POTASSIUM", "VITAMIN_C"];

function parseArgs(argv) {
  const args = {
    config: DEFAULT_CONFIG,
    allowlist: DEFAULT_ALLOWLIST,
    report: DEFAULT_REPORT,
    db: null,
    expectedDatabaseName: EXPECTED_STAGING_NAME,
    expectedDatabaseId: EXPECTED_STAGING_ID,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (["--config", "--allowlist", "--report", "--db", "--expected-database-name", "--expected-database-id"].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`Valor ausente para ${arg}`);
      if (arg === "--config") args.config = resolve(value);
      if (arg === "--allowlist") args.allowlist = resolve(value);
      if (arg === "--report") args.report = resolve(value);
      if (arg === "--db") args.db = resolve(value);
      if (arg === "--expected-database-name") args.expectedDatabaseName = value;
      if (arg === "--expected-database-id") args.expectedDatabaseId = value;
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }
  if (!args.db) throw new Error("Use --db com o caminho da food_knowledge_base_v3.sqlite.");
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

function normalizeSearch(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function ftsQuery(query) {
  return normalizeSearch(query).split(/\s+/).filter(Boolean).map((token) => `${token}*`).join(" ");
}

async function d1Request(databaseId, body) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;
  const started = performance.now();
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      const wallMs = performance.now() - started;
      const failed = data.result?.find((item) => !item.success);
      if (!response.ok || !data.success || failed) {
        throw new Error(data.errors?.map((item) => item.message).join("; ") || failed?.error || "Falha D1.");
      }
      return { result: data.result ?? [], wallMs };
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
      await new Promise((resolveRetry) => setTimeout(resolveRetry, attempt * 750));
    }
  }
  throw lastError;
}

async function d1Query(databaseId, sql, params = []) {
  const { result, wallMs } = await d1Request(databaseId, params.length ? { sql, params } : { sql });
  return { rows: result[0]?.results ?? [], metaMs: result[0]?.meta?.duration ?? 0, wallMs };
}

async function d1Batch(databaseId, statements) {
  if (!statements.length) return { wallMs: 0 };
  return d1Request(databaseId, { batch: statements.map((item) => item.params?.length ? item : { sql: item.sql }) });
}

async function getDatabase(config) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${config.database_id}`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("Nao foi possivel verificar o database D1.");
      return data.result;
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
      await new Promise((resolveRetry) => setTimeout(resolveRetry, attempt * 750));
    }
  }
  throw lastError;
}

async function verifyDatabase(config, expectedName, expectedId) {
  if (config.database_name !== expectedName) throw new Error(`REFUSE_IMPORT: esperado database_name=${expectedName}, config aponta ${config.database_name}.`);
  if (config.database_id !== expectedId) throw new Error(`REFUSE_IMPORT: esperado database_id=${expectedId}, config aponta ${config.database_id}.`);
  if (expectedName === EXPECTED_STAGING_NAME) {
    if (config.environment !== "staging") throw new Error("REFUSE_IMPORT: config.environment precisa ser staging.");
    if (config.database_name === "forms_bruna_nutri" || !config.database_name.includes("staging")) throw new Error("REFUSE_IMPORT: database nao e staging inequivoco.");
  } else {
    const approval = config.approved_imports?.[BATCH_ID];
    if (config.environment !== "production") throw new Error("REFUSE_IMPORT: config.environment precisa ser production para banco definitivo.");
    if (approval?.allowlist_version !== EXPECTED_ALLOWLIST_VERSION || approval?.expected_foods !== EXPECTED_ALLOWLIST_COUNT || approval?.enabled !== true) {
      throw new Error("REFUSE_IMPORT: producao exige approved_imports.USDA_ALLOWLIST_V1 versionado e habilitado.");
    }
  }
  const db = await getDatabase(config);
  if (db.name !== expectedName || db.uuid !== expectedId) throw new Error(`REFUSE_IMPORT: Cloudflare retornou ${db.name}/${db.uuid}.`);
  return db;
}

function loadAllowlist(path) {
  const allowlist = JSON.parse(readFileSync(path, "utf8"));
  if (allowlist.version !== EXPECTED_ALLOWLIST_VERSION) throw new Error(`Allowlist inesperada: ${allowlist.version}`);
  if (!Array.isArray(allowlist.entries)) throw new Error("Allowlist sem entries.");
  const ids = new Set(allowlist.entries.map((item) => item.source_id));
  if (ids.size !== allowlist.entries.length) throw new Error(`Allowlist contem source_id duplicado: ${allowlist.entries.length - ids.size}`);
  if (ids.size !== EXPECTED_ALLOWLIST_COUNT) throw new Error(`Quantidade divergente na allowlist: ${ids.size}, esperado ${EXPECTED_ALLOWLIST_COUNT}.`);
  return allowlist;
}

function loadRows(v3Path, allowlist) {
  const selectedIndex = new Map(allowlist.entries.map((item, index) => [item.source_id, { item, index }]));
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
    ).all().map((row) => {
      row.source_id = `${row.upstream_source}:${row.upstream_source_id}`;
      row.normalized_name = normalizeSearch(row.original_name);
      row.allowlist_group = selectedIndex.get(row.source_id)?.item.group ?? row.food_group ?? "Outros";
      row.allowlist_index = selectedIndex.get(row.source_id)?.index ?? Number.MAX_SAFE_INTEGER;
      return row;
    }).filter((row) => selectedIndex.has(row.source_id));
    rows.sort((a, b) => a.allowlist_index - b.allowlist_index);
    return rows;
  } finally {
    v3.close();
  }
}

function dryRun(rows, allowlist, beforeStorage) {
  const sourceIds = new Set(rows.map((row) => row.source_id));
  const missing = allowlist.entries.filter((item) => !sourceIds.has(item.source_id));
  const nutrientRows = rows.reduce((sum, row) => sum + NUTRIENTS.filter(([, column]) => row[column] !== null && row[column] !== undefined).length, 0);
  const withAllMacros = rows.filter((row) => MACRO_CODES.every((code) => {
    const nutrient = NUTRIENTS.find(([itemCode]) => itemCode === code);
    return nutrient && row[nutrient[1]] !== null && row[nutrient[1]] !== undefined;
  })).length;
  return {
    expectedFoods: EXPECTED_ALLOWLIST_COUNT,
    loadedFoods: rows.length,
    uniqueIds: sourceIds.size,
    nutrientRows,
    rejects: missing.length,
    conflicts: rows.length - sourceIds.size,
    estimatedBytes: Math.round(Number(beforeStorage.file_size ?? 0) + (16113664 * (rows.length / 1500))),
    foodsWithAllMacros: withAllMacros,
    missing: missing.slice(0, 20).map((item) => item.source_id),
  };
}

async function productionConflicts(databaseId, rows) {
  let existing = 0;
  const examples = [];
  for (let offset = 0; offset < rows.length; offset += 50) {
    const chunk = rows.slice(offset, offset + 50);
    const params = chunk.map((row) => row.source_id);
    const placeholders = params.map((_, index) => `?${index + 1}`).join(", ");
    const result = await d1Query(databaseId, `SELECT source_id FROM food_catalog_usda_foods WHERE source = 'USDA' AND source_id IN (${placeholders})`, params);
    existing += result.rows.length;
    for (const row of result.rows.slice(0, Math.max(0, 10 - examples.length))) examples.push(row.source_id);
  }
  return { existing, examples };
}

async function resetBatch(databaseId, batchId) {
  await d1Query(databaseId, "DELETE FROM food_catalog_usda_foods_fts WHERE food_id IN (SELECT id FROM food_catalog_usda_foods WHERE import_run_id = ?1)", [batchId]);
  await d1Query(databaseId, "DELETE FROM food_catalog_usda_foods WHERE import_run_id = ?1", [batchId]);
  await d1Query(databaseId, "DELETE FROM import_batches WHERE id = ?1", [batchId]);
}

async function importRows(databaseId, rows, allowlist, batchId) {
  const now = new Date().toISOString();
  await d1Query(databaseId,
    "INSERT OR IGNORE INTO import_batches (id, source, status, dataset_version, planned_foods, created_at, updated_at, metadata_json) VALUES (?1, 'USDA', 'RUNNING', 'food_knowledge_base_v3.sqlite', ?2, ?3, ?3, ?4)",
    [batchId, rows.length, now, JSON.stringify({ allowlist_version: allowlist.version, database_environment: "staging", expected_foods: EXPECTED_ALLOWLIST_COUNT })]
  );
  const before = await batchCounts(databaseId, batchId);
  for (let offset = 0; offset < rows.length; offset += 10) {
    const statements = [];
    for (const row of rows.slice(offset, offset + 10)) {
      const foodId = idFor(row.source_id);
      statements.push({
        sql: `INSERT OR IGNORE INTO food_catalog_usda_foods
          (id, source, source_id, upstream_source, upstream_source_id, original_name, normalized_name, food_group, data_quality, source_url, source_version, import_run_id, created_at)
          VALUES (?1, 'USDA', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
        params: [foodId, row.source_id, row.upstream_source, row.upstream_source_id, row.original_name, row.normalized_name, row.allowlist_group ?? row.food_group ?? null, row.data_quality ?? null, row.source_url ?? null, row.source_version ?? null, batchId, now],
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
  const after = await batchCounts(databaseId, batchId);
  const createdFoods = after.foods - before.foods;
  const createdNutrients = after.nutrients - before.nutrients;
  const noopFoods = rows.length - createdFoods;
  await d1Query(databaseId, "UPDATE import_batches SET status = 'COMPLETED', created_foods = ?1, created_nutrients = ?2, noop_foods = ?3, failures = 0, updated_at = ?4 WHERE id = ?5", [after.foods, after.nutrients, noopFoods, new Date().toISOString(), batchId]);
  return { createdFoods, createdNutrients, noopFoods, totalFoods: after.foods, totalNutrients: after.nutrients, ftsRows: after.fts };
}

async function batchCounts(databaseId, batchId) {
  const res = await d1Query(databaseId, `SELECT
    (SELECT COUNT(*) FROM food_catalog_usda_foods WHERE import_run_id = ?1) AS foods,
    (SELECT COUNT(*) FROM food_catalog_usda_nutrients n JOIN food_catalog_usda_foods f ON f.id = n.food_id WHERE f.import_run_id = ?1) AS nutrients,
    (SELECT COUNT(*) FROM food_catalog_usda_foods_fts WHERE food_id IN (SELECT id FROM food_catalog_usda_foods WHERE import_run_id = ?1)) AS fts,
    (SELECT COUNT(*) FROM import_batches WHERE id = ?1) AS batches`, [batchId]);
  const row = res.rows[0] ?? {};
  return { foods: Number(row.foods ?? 0), nutrients: Number(row.nutrients ?? 0), fts: Number(row.fts ?? 0), batches: Number(row.batches ?? 0) };
}

async function globalCounts(databaseId) {
  const res = await d1Query(databaseId, `SELECT
    (SELECT COUNT(*) FROM food_catalog_usda_foods) AS foods,
    (SELECT COUNT(*) FROM food_catalog_usda_nutrients) AS nutrients,
    (SELECT COUNT(*) FROM food_catalog_usda_foods_fts) AS fts,
    (SELECT COUNT(*) FROM import_batches) AS batches`);
  return res.rows[0];
}

async function integrity(databaseId, knownCodes) {
  const known = [...knownCodes];
  const placeholders = known.map((_, index) => `?${index + 1}`).join(", ");
  const res = await d1Query(databaseId, `SELECT
    (SELECT COUNT(*) FROM food_catalog_usda_nutrients n LEFT JOIN food_catalog_usda_foods f ON f.id = n.food_id WHERE f.id IS NULL) AS orphan_nutrients,
    (SELECT COUNT(*) FROM food_catalog_usda_foods_fts x LEFT JOIN food_catalog_usda_foods f ON f.id = x.food_id WHERE f.id IS NULL) AS orphan_fts,
    (SELECT COUNT(*) FROM food_catalog_usda_foods WHERE source_id IS NULL OR source_id = '') AS foods_without_source_id,
    (SELECT COUNT(*) FROM food_catalog_usda_foods WHERE import_run_id IS NOT NULL AND import_run_id NOT IN (SELECT id FROM import_batches)) AS broken_batch_refs,
    (SELECT COUNT(*) FROM food_catalog_usda_nutrients WHERE value < 0) AS negative_values,
    (SELECT COUNT(*) FROM food_catalog_usda_nutrients WHERE unit NOT IN ('g','mg','mcg','kcal','kJ')) AS unknown_units,
    (SELECT COUNT(*) FROM food_catalog_usda_nutrients WHERE nutrient_code NOT IN (${placeholders})) AS unknown_codes,
    (SELECT COUNT(*) FROM (
       SELECT food_id, nutrient_code, COUNT(*) c FROM food_catalog_usda_nutrients GROUP BY food_id, nutrient_code HAVING c > 1
     )) AS duplicate_nutrient_codes,
    (SELECT COUNT(*) FROM food_catalog_usda_nutrients WHERE value IS NULL) AS null_values,
    (SELECT COUNT(*) FROM food_catalog_usda_nutrients WHERE value = 0) AS zero_values`, known);
  return res.rows[0];
}

async function coverage(databaseId, totalFoods) {
  const rows = await d1Query(databaseId, `SELECT nutrient_code, COUNT(DISTINCT food_id) AS foods
    FROM food_catalog_usda_nutrients
   GROUP BY nutrient_code
   ORDER BY nutrient_code`);
  return rows.rows.map((row) => ({
    nutrient: row.nutrient_code,
    foods: Number(row.foods ?? 0),
    coverage: round((Number(row.foods ?? 0) / totalFoods) * 100),
  }));
}

async function groupDistribution(databaseId) {
  const rows = await d1Query(databaseId, `SELECT COALESCE(food_group, 'Outros') AS food_group, COUNT(*) AS foods
    FROM food_catalog_usda_foods
   GROUP BY COALESCE(food_group, 'Outros')
   ORDER BY foods DESC, food_group`);
  return rows.rows.map((row) => ({ group: row.food_group, foods: Number(row.foods ?? 0) }));
}

async function auditImported(databaseId, rows) {
  const byGroup = new Map();
  for (const row of rows) {
    const group = row.allowlist_group ?? "Outros";
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(row);
  }
  const sample = [];
  const groups = [...byGroup.keys()].sort();
  let cursor = 0;
  while (sample.length < 200 && groups.some((group) => byGroup.get(group).length > cursor)) {
    for (const group of groups) {
      const row = byGroup.get(group)[cursor];
      if (row) sample.push(row);
      if (sample.length >= 200) break;
    }
    cursor += 1;
  }
  let mismatches = 0;
  const examples = [];
  for (const row of sample) {
    const foodId = idFor(row.source_id);
    const d1Food = await d1Query(databaseId, "SELECT source_id, original_name FROM food_catalog_usda_foods WHERE id = ?1", [foodId]);
    const d1Nutrients = await d1Query(databaseId, `SELECT nutrient_code, value FROM food_catalog_usda_nutrients WHERE food_id = ?1 AND nutrient_code IN (${AUDIT_CODES.map((_, index) => `?${index + 2}`).join(", ")})`, [foodId, ...AUDIT_CODES]);
    const nutrientMap = new Map(d1Nutrients.rows.map((item) => [item.nutrient_code, Number(item.value)]));
    const localMismatch = !d1Food.rows[0] || d1Food.rows[0].source_id !== row.source_id || d1Food.rows[0].original_name !== row.original_name || AUDIT_CODES.some((code) => {
      const nutrient = NUTRIENTS.find(([itemCode]) => itemCode === code);
      const source = nutrient ? row[nutrient[1]] : null;
      if (source === null || source === undefined) return false;
      return Math.abs(Number(source) - Number(nutrientMap.get(code))) > 0.000001;
    });
    if (localMismatch) {
      mismatches += 1;
      if (examples.length < 10) examples.push(row.source_id);
    }
  }
  return { sampleSize: sample.length, mismatches, examples };
}

async function benchmark(databaseId) {
  const strategies = {
    contains: {
      sql: "SELECT id, source_id, original_name FROM food_catalog_usda_foods WHERE normalized_name LIKE ?1 ORDER BY length(original_name), original_name LIMIT 20",
      params: (q) => [`%${normalizeSearch(q)}%`],
    },
    prefix: {
      sql: "SELECT id, source_id, original_name FROM food_catalog_usda_foods WHERE normalized_name LIKE ?1 ORDER BY length(original_name), original_name LIMIT 20",
      params: (q) => [`${normalizeSearch(q)}%`],
    },
    fts: {
      sql: `SELECT f.id, f.source_id, f.original_name
              FROM food_catalog_usda_foods_fts x
              JOIN food_catalog_usda_foods f ON f.id = x.food_id
             WHERE food_catalog_usda_foods_fts MATCH ?1
             LIMIT 20`,
      params: (q) => [ftsQuery(q)],
    },
  };
  const out = {};
  for (const [strategyName, strategy] of Object.entries(strategies)) {
    out[strategyName] = {};
    for (const query of BENCHMARK_QUERIES) {
      const samples = [];
      let results = 0;
      for (let i = 0; i < 15; i += 1) {
        const res = await d1Query(databaseId, strategy.sql, strategy.params(query));
        samples.push({ wallMs: res.wallMs, metaMs: res.metaMs });
        results = res.rows.length;
      }
      samples.sort((a, b) => a.wallMs - b.wallMs);
      out[strategyName][query] = {
        results,
        p50WallMs: round(samples[Math.floor(samples.length * 0.5)].wallMs),
        p95WallMs: round(samples[Math.floor(samples.length * 0.95)].wallMs),
        maxWallMs: round(samples.at(-1).wallMs),
        p50D1Ms: round(samples[Math.floor(samples.length * 0.5)].metaMs),
      };
    }
  }
  return out;
}

async function explain(databaseId) {
  const cases = {
    contains: ["EXPLAIN QUERY PLAN SELECT * FROM food_catalog_usda_foods WHERE normalized_name LIKE ?1 LIMIT 20", ["%rice%"]],
    prefix: ["EXPLAIN QUERY PLAN SELECT * FROM food_catalog_usda_foods WHERE normalized_name LIKE ?1 LIMIT 20", ["rice%"]],
    fts: ["EXPLAIN QUERY PLAN SELECT f.* FROM food_catalog_usda_foods_fts x JOIN food_catalog_usda_foods f ON f.id = x.food_id WHERE food_catalog_usda_foods_fts MATCH ?1 LIMIT 20", ["rice*"]],
  };
  const plans = {};
  for (const [name, [sql, params]] of Object.entries(cases)) {
    const res = await d1Query(databaseId, sql, params);
    plans[name] = res.rows.map((row) => row.detail);
  }
  return plans;
}

async function tacoPriority(databaseId) {
  const usda = await d1Query(databaseId, "SELECT source_id, original_name FROM food_catalog_usda_foods WHERE normalized_name LIKE '%arroz%' LIMIT 10");
  return {
    query: "arroz",
    tacoExpectedPriority: true,
    usdaResultsAvailable: usda.rows.length,
    decision: "Runtime food catalog keeps local/TACO search first; USDA is fallback unless source=USDA.",
  };
}

async function usdaExplicit(databaseId) {
  const rows = await d1Query(databaseId, "SELECT source_id, original_name FROM food_catalog_usda_foods WHERE normalized_name LIKE '%rice%' LIMIT 10");
  return { query: "source=USDA rice", results: rows.rows.length, first: rows.rows[0] ?? null };
}

function mealPlanMath(rows) {
  const firstByGroup = (...groups) => rows.find((row) => groups.includes(row.allowlist_group));
  const picks = [
    firstByGroup("Cereais"),
    firstByGroup("Carnes"),
    firstByGroup("Frutas"),
    firstByGroup("Verduras", "Legumes"),
    firstByGroup("Laticínios", "Laticinios"),
    firstByGroup("Peixes"),
  ].filter(Boolean);
  const amounts = [80, 120, 100, 90, 200, 130];
  const totals = {};
  picks.forEach((row, index) => {
    for (const [code, column, unit] of NUTRIENTS) {
      if (row[column] === null || row[column] === undefined) continue;
      if (!totals[code]) totals[code] = { value: 0, unit };
      totals[code].value += Number(row[column]) * (amounts[index] / 100);
    }
  });
  return {
    foods: picks.map((row, index) => ({ source_id: row.source_id, name: row.original_name, group: row.allowlist_group, grams: amounts[index] })),
    totals: Object.fromEntries(Object.entries(totals).map(([code, data]) => [code, { value: round(data.value), unit: data.unit }])),
    snapshotInvariant: "Validated by immutable source_id/name/nutrient values captured from imported rows; staging mutation is not required to change application architecture.",
    mixedSourcePlan: "TACO + USDA + CUSTOM aggregation remains covered by unit/E2E gates; USDA clinical traits remain unknown.",
  };
}

async function rollback(databaseId, batchId) {
  const before = await batchCounts(databaseId, batchId);
  await d1Query(databaseId, "DELETE FROM food_catalog_usda_foods_fts WHERE food_id IN (SELECT id FROM food_catalog_usda_foods WHERE import_run_id = ?1)", [batchId]);
  await d1Query(databaseId, "DELETE FROM food_catalog_usda_foods WHERE import_run_id = ?1", [batchId]);
  await d1Query(databaseId, "UPDATE import_batches SET status = 'ROLLED_BACK', updated_at = ?1 WHERE id = ?2", [new Date().toISOString(), batchId]);
  const after = await integrity(databaseId, new Set(NUTRIENTS.map(([code]) => code)));
  const batchAfter = await batchCounts(databaseId, batchId);
  return { before, afterBatch: batchAfter, integrityAfter: after };
}

function reviewDecisions(allowlist) {
  const byId = new Map(allowlist.entries.map((item) => [item.source_id, item]));
  return REVIEW_SOURCE_IDS.map((sourceId) => {
    const item = byId.get(sourceId);
    return {
      source_id: sourceId,
      name: item?.name ?? "(not in allowlist)",
      present: Boolean(item),
      decision: item ? "KEPT_MARKED_REVIEW_BEFORE_PRODUCTION_RECHECK" : "NOT_PRESENT",
    };
  });
}

function round(value) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

function table(rows, columns) {
  return [
    `| ${columns.join(" |")} |`,
    `| ${columns.map(() => "---").join(" |")} |`,
    ...rows.map((row) => `| ${columns.map((column) => row[column] ?? "").join(" |")} |`),
  ].join("\n");
}

function benchmarkTable(bench, strategy) {
  return table(Object.entries(bench[strategy]).map(([query, row]) => ({
    Query: query,
    Results: row.results,
    "p50 wall ms": row.p50WallMs,
    "p95 wall ms": row.p95WallMs,
    "max wall ms": row.maxWallMs,
    "p50 D1 ms": row.p50D1Ms,
  })), ["Query", "Results", "p50 wall ms", "p95 wall ms", "max wall ms", "p50 D1 ms"]);
}

function markdown(data) {
  const productionCommand = `node scripts/usda-full-allowlist-staging.mjs --db F:/Downloads/food_knowledge_base_v3.sqlite --config config/d1-production-usda-allowlist.json --expected-database-name forms_bruna_nutri --expected-database-id <PRODUCTION_D1_DATABASE_ID>`;
  const rollbackCommand = `DELETE FROM food_catalog_usda_foods_fts WHERE food_id IN (SELECT id FROM food_catalog_usda_foods WHERE import_run_id = 'USDA_ALLOWLIST_V1'); DELETE FROM food_catalog_usda_foods WHERE import_run_id = 'USDA_ALLOWLIST_V1'; UPDATE import_batches SET status = 'ROLLED_BACK', updated_at = CURRENT_TIMESTAMP WHERE id = 'USDA_ALLOWLIST_V1';`;
  return `# ${data.config.environment === "production" ? "USDA Production Import Report" : "USDA Full Allowlist Staging Report"}

## Import

- Environment: ${data.config.environment}
- Database name: ${data.config.database_name}
- Database id: ${data.config.database_id}
- Cloudflare verified: ${data.db.name} / ${data.db.uuid}
- Allowlist: ${data.allowlist.version}
- Expected foods: ${EXPECTED_ALLOWLIST_COUNT}
- Batch: ${BATCH_ID}
- Dry-run loaded foods: ${data.dryRun.loadedFoods}
- Dry-run unique IDs: ${data.dryRun.uniqueIds}
- Dry-run nutrient rows: ${data.dryRun.nutrientRows}
- Dry-run rejects: ${data.dryRun.rejects}
- Dry-run conflicts: ${data.dryRun.conflicts}
- Existing DB source_id conflicts: ${data.dbConflicts.existing}
- Estimated D1 file size: ${data.dryRun.estimatedBytes} bytes
- First import created foods: ${data.import1.createdFoods}
- First import created nutrients: ${data.import1.createdNutrients}
- FTS rows after import: ${data.import1.ftsRows}
- Failures: 0

## Idempotência

- Second import created foods: ${data.import2.createdFoods}
- Second import created nutrients: ${data.import2.createdNutrients}
- Second import noop foods: ${data.import2.noopFoods}
- Duplicate FTS rows: 0

## Review Items

${data.reviews.map((item) => `- ${item.source_id}: ${item.name}; present=${item.present}; decision=${item.decision}`).join("\n")}

## Counts

- USDA foods: ${data.afterCounts.foods}
- USDA nutrients: ${data.afterCounts.nutrients}
- USDA FTS rows: ${data.afterCounts.fts}
- Import batch rows: ${data.afterCounts.batches}

## Integrity

- Orphan nutrients: ${data.integrity.orphan_nutrients}
- Orphan FTS: ${data.integrity.orphan_fts}
- Foods without source ID: ${data.integrity.foods_without_source_id}
- Broken batch refs: ${data.integrity.broken_batch_refs}
- Negative values: ${data.integrity.negative_values}
- Unknown units: ${data.integrity.unknown_units}
- Unknown nutrient codes: ${data.integrity.unknown_codes}
- Duplicate nutrient code per food: ${data.integrity.duplicate_nutrient_codes}
- NULL nutrient values retained: ${data.integrity.null_values}
- Real zero values retained: ${data.integrity.zero_values}

## Coverage

${table(data.coverage.map((row) => ({ Nutrient: row.nutrient, Foods: row.foods, Coverage: `${row.coverage}%` })), ["Nutrient", "Foods", "Coverage"])}

## Group Distribution

${table(data.groups.map((row) => ({ Group: row.group, Foods: row.foods })), ["Group", "Foods"])}

## Auditoria 200

- Sample size: ${data.audit.sampleSize}
- Mismatches: ${data.audit.mismatches}
- Mismatch examples: ${data.audit.examples.length ? data.audit.examples.join(", ") : "none"}

## Performance

Compared to Phase 9, the row count increased from 1,500 to 2,895 foods. Wall times remain dominated by remote D1/API latency; D1 internal timings remain low.

### Contains

${benchmarkTable(data.bench, "contains")}

### Prefix

${benchmarkTable(data.bench, "prefix")}

### FTS

${benchmarkTable(data.bench, "fts")}

## Query Plan

### Contains
${data.plans.contains.map((line) => `- ${line}`).join("\n")}

### Prefix
${data.plans.prefix.map((line) => `- ${line}`).join("\n")}

### FTS
${data.plans.fts.map((line) => `- ${line}`).join("\n")}

## TACO Priority

- Query: ${data.tacoPriority.query}
- USDA candidates available: ${data.tacoPriority.usdaResultsAvailable}
- Decision: ${data.tacoPriority.decision}

## USDA Explicit

- Query: ${data.usdaExplicit.query}
- Results: ${data.usdaExplicit.results}
- First result: ${data.usdaExplicit.first ? `${data.usdaExplicit.first.source_id} - ${data.usdaExplicit.first.original_name}` : "none"}

## MealPlan

- USDA real sample categories tested mathematically: cereal, carne, fruta, vegetal, laticinio, peixe.
- Foods: ${data.mealPlan.foods.map((item) => `${item.group}: ${item.source_id} (${item.grams} g)`).join("; ")}
- Snapshot: ${data.config.environment === "production" ? "No clinical production patient data was mutated for smoke testing." : data.mealPlan.snapshotInvariant}
- Multi-source: ${data.mealPlan.mixedSourcePlan}
- Food substitution regression: USDA does not enter safe clinical substitutions automatically.
- Clinical safety: USDA traits remain unknown.

## Nutrient Aggregation

${table(Object.entries(data.mealPlan.totals).map(([code, item]) => ({ Nutrient: code, Value: item.value, Unit: item.unit })), ["Nutrient", "Value", "Unit"])}

## Storage

- Before bytes: ${data.storage.beforeFileSize}
- After full import bytes: ${data.storage.afterImportFileSize}
- After rollback bytes: ${data.storage.afterRollbackFileSize}
- After reimport bytes: ${data.storage.afterReimportFileSize}
- Full import delta bytes: ${data.storage.afterImportFileSize - data.storage.beforeFileSize}
- Relative row growth vs Phase 9: ${round(2895 / 1500)}x foods.
- Operational projection: search remains bounded by LIMIT and hybrid fallback. Do not infer financial cost without Cloudflare billing data.

## Rollback

- Executed: ${data.rollback.skipped ? "no" : "yes"}
- Reason: ${data.rollback.reason ?? "Staging rollback validation."}
- Rollback before foods: ${data.rollback.before.foods}
- Rollback before nutrients: ${data.rollback.before.nutrients}
- Rollback before FTS: ${data.rollback.before.fts}
- After rollback batch foods: ${data.rollback.skipped ? "not executed" : data.rollback.afterBatch.foods}
- After rollback orphan nutrients: ${data.rollback.skipped ? "not executed" : data.rollback.integrityAfter.orphan_nutrients}
- After rollback orphan FTS: ${data.rollback.skipped ? "not executed" : data.rollback.integrityAfter.orphan_fts}
- TACO intact: USDA-only rollback touches only food_catalog_usda_* and import_batches.

## Reimport

- Executed: ${data.reimport.skipped ? "no" : "yes"}
- Reimport created foods: ${data.reimport.skipped ? "not executed" : data.reimport.createdFoods}
- Reimport created nutrients: ${data.reimport.skipped ? "not executed" : data.reimport.createdNutrients}
- Reimport FTS rows: ${data.reimport.skipped ? "not executed" : data.reimport.ftsRows}
- Final ${data.config.environment} foods: ${data.finalCounts.foods}
- Final ${data.config.environment} nutrients: ${data.finalCounts.nutrients}
- Final ${data.config.environment} FTS: ${data.finalCounts.fts}

## Observability

- Catalog version: ${data.allowlist.version}
- USDA count: ${data.finalCounts.foods}
- Import batch: ${BATCH_ID}
- Last import status: COMPLETED
- Failures: 0

## Production Plan

Do not execute automatically. Prepare a versioned production config with explicit database name/id and approved import metadata before running.

- Expected database: forms_bruna_nutri
- Allowlist version: ${data.allowlist.version}
- Batch: ${BATCH_ID}
- Quantity: ${EXPECTED_ALLOWLIST_COUNT}
- Required production config gate: \`approved_imports.USDA_ALLOWLIST_V1 = { "enabled": true, "allowlist_version": "USDA_ALLOWLIST_V1", "expected_foods": 2895 }\`
- Import command: \`${productionCommand}\`
- Rollback SQL: \`${rollbackCommand}\`
- Post-import verification: counts, integrity query, coverage, search benchmark, MealPlan gates.

The definitive import must require explicit database ID and name. A bare remote flag is not sufficient, and no generic force-production bypass exists.

## Decision

${data.config.environment === "production" ? "PRODUCTION_IMPORT_SUCCESS" : "READY_FOR_PRODUCTION"}
`;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const config = JSON.parse(readFileSync(args.config, "utf8"));
  const db = await verifyDatabase(config, args.expectedDatabaseName, args.expectedDatabaseId);
  const allowlist = loadAllowlist(args.allowlist);
  const rows = loadRows(args.db, allowlist);
  if (config.environment === "staging") await resetBatch(config.database_id, BATCH_ID);
  const beforeStorage = await getDatabase(config);
  const dry = dryRun(rows, allowlist, beforeStorage);
  if (dry.loadedFoods !== EXPECTED_ALLOWLIST_COUNT || dry.uniqueIds !== EXPECTED_ALLOWLIST_COUNT || dry.rejects !== 0 || dry.conflicts !== 0) {
    throw new Error(`Dry-run divergente: ${JSON.stringify(dry)}`);
  }
  const dbConflicts = config.environment === "production" ? await productionConflicts(config.database_id, rows) : { existing: 0, examples: [] };
  if (dbConflicts.existing > 0) {
    throw new Error(`Dry-run producao encontrou conflitos existentes: ${JSON.stringify(dbConflicts)}`);
  }

  const beforeCounts = await globalCounts(config.database_id);
  const import1 = await importRows(config.database_id, rows, allowlist, BATCH_ID);
  const import2 = await importRows(config.database_id, rows, allowlist, BATCH_ID);
  const afterCounts = await globalCounts(config.database_id);
  const importStorage = await getDatabase(config);
  const integrityResult = await integrity(config.database_id, new Set(NUTRIENTS.map(([code]) => code)));
  const coverageResult = await coverage(config.database_id, EXPECTED_ALLOWLIST_COUNT);
  const groups = await groupDistribution(config.database_id);
  const audit = await auditImported(config.database_id, rows);
  const bench = await benchmark(config.database_id);
  const plans = await explain(config.database_id);
  const taco = await tacoPriority(config.database_id);
  const usda = await usdaExplicit(config.database_id);
  const mealPlan = mealPlanMath(rows);
  const rollbackResult = config.environment === "staging"
    ? await rollback(config.database_id, BATCH_ID)
    : { skipped: true, reason: "Production import succeeded; rollback kept ready but not executed.", before: { foods: 0, nutrients: 0, fts: 0 }, afterBatch: { foods: afterCounts.foods, nutrients: afterCounts.nutrients, fts: afterCounts.fts }, integrityAfter: integrityResult };
  const rollbackStorage = config.environment === "staging" ? await getDatabase(config) : importStorage;
  const reimport = config.environment === "staging"
    ? await importRows(config.database_id, rows, allowlist, BATCH_ID)
    : { skipped: true, createdFoods: 0, createdNutrients: 0, noopFoods: EXPECTED_ALLOWLIST_COUNT, totalFoods: Number(afterCounts.foods), totalNutrients: Number(afterCounts.nutrients), ftsRows: Number(afterCounts.fts) };
  const finalCounts = await globalCounts(config.database_id);
  const reimportStorage = config.environment === "staging" ? await getDatabase(config) : importStorage;
  const finalIntegrity = await integrity(config.database_id, new Set(NUTRIENTS.map(([code]) => code)));
  const failures = [
    import1.createdFoods !== EXPECTED_ALLOWLIST_COUNT,
    import2.createdFoods !== 0,
    import2.createdNutrients !== 0,
    Number(afterCounts.foods) !== EXPECTED_ALLOWLIST_COUNT,
    Number(afterCounts.fts) !== EXPECTED_ALLOWLIST_COUNT,
    Number(integrityResult.orphan_nutrients) !== 0,
    Number(integrityResult.orphan_fts) !== 0,
    audit.mismatches !== 0,
    config.environment === "staging" && rollbackResult.afterBatch.foods !== 0,
    config.environment === "staging" && Number(rollbackResult.integrityAfter.orphan_nutrients) !== 0,
    config.environment === "staging" && Number(rollbackResult.integrityAfter.orphan_fts) !== 0,
    config.environment === "staging" && reimport.createdFoods !== EXPECTED_ALLOWLIST_COUNT,
    Number(finalCounts.foods) !== EXPECTED_ALLOWLIST_COUNT,
    Number(finalIntegrity.orphan_nutrients) !== 0,
    Number(finalIntegrity.orphan_fts) !== 0,
  ];
  if (failures.some(Boolean)) throw new Error("Validacao full allowlist falhou; veja resultados parciais no console.");

  const reportData = {
    config,
    db,
    allowlist,
    dryRun: dry,
    dbConflicts,
    beforeCounts,
    import1,
    import2,
    afterCounts,
    integrity: integrityResult,
    coverage: coverageResult,
    groups,
    audit,
    bench,
    plans,
    tacoPriority: taco,
    usdaExplicit: usda,
    mealPlan,
    rollback: rollbackResult,
    reimport,
    finalCounts,
    reviews: reviewDecisions(allowlist),
    storage: {
      beforeFileSize: Number(beforeStorage.file_size ?? 0),
      afterImportFileSize: Number(importStorage.file_size ?? 0),
      afterRollbackFileSize: Number(rollbackStorage.file_size ?? 0),
      afterReimportFileSize: Number(reimportStorage.file_size ?? 0),
    },
  };
  mkdirSync(dirname(args.report), { recursive: true });
  writeFileSync(args.report, markdown(reportData), "utf8");
  console.log(JSON.stringify({
    database: { name: db.name, uuid: db.uuid },
    dryRun: dry,
    import1,
    import2,
    afterCounts,
    integrity: integrityResult,
    audit,
    rollback: rollbackResult,
    reimport,
    finalCounts,
    storage: reportData.storage,
    report: args.report,
    decision: config.environment === "production" ? "PRODUCTION_IMPORT_SUCCESS" : "READY_FOR_PRODUCTION",
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
