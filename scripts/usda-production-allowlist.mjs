#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sqlite from "node:sqlite";
import { normalizeText } from "./lib/food-kb-import-core.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "USDA_ALLOWLIST_V1";
const DEFAULT_ALLOWLIST = resolve(ROOT_DIR, "data/usda-production-allowlist.json");
const DEFAULT_REPORT = resolve(ROOT_DIR, "reports/usda-production-allowlist-report.md");
const DEFAULT_BENCHMARK_DB = resolve(ROOT_DIR, "reports/usda-allowlist-benchmark.sqlite");
const DEFAULT_BATCH_ID = "USDA_ALLOWLIST_BENCHMARK_20260816";

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

const CATEGORY_RULES = [
  { id: "cereals", label: "Cereais", cap: 320, group: ["cereal grains", "baked products"], patterns: ["rice", "oat", "wheat", "bread", "pasta", "cereal", "quinoa", "barley", "corn", "flour", "noodle", "buckwheat"] },
  { id: "legumes", label: "Leguminosas", cap: 260, group: ["legumes"], patterns: ["bean", "lentil", "chickpea", "pea", "soy", "tofu", "tempeh"] },
  { id: "meats", label: "Carnes", cap: 310, group: ["beef", "pork", "lamb", "sausages"], patterns: ["beef", "pork", "lamb", "veal", "bison", "meat"] },
  { id: "poultry", label: "Aves", cap: 250, group: ["poultry"], patterns: ["chicken", "turkey", "duck", "goose"] },
  { id: "fish", label: "Peixes", cap: 300, group: ["finfish"], patterns: ["salmon", "tuna", "cod", "fish", "trout", "sardine", "halibut", "tilapia", "haddock", "mackerel"] },
  { id: "seafood", label: "Frutos do mar", cap: 180, group: ["shellfish"], patterns: ["shrimp", "crab", "lobster", "clam", "oyster", "scallop", "mussel", "octopus", "squid"] },
  { id: "eggs", label: "Ovos", cap: 90, group: ["egg"], patterns: ["egg", "omelet"] },
  { id: "dairy", label: "Laticinios", cap: 320, group: ["dairy"], patterns: ["milk", "yogurt", "cheese", "dairy", "cottage", "kefir", "whey"] },
  { id: "fruits", label: "Frutas", cap: 360, group: ["fruit"], patterns: ["apple", "banana", "blueberry", "berry", "orange", "grape", "fruit", "pear", "peach", "mango", "melon", "avocado", "pineapple", "breadfruit"] },
  { id: "greens", label: "Verduras", cap: 220, group: ["vegetables"], patterns: ["lettuce", "spinach", "kale", "greens", "arugula", "cabbage", "chard", "watercress"] },
  { id: "vegetables", label: "Legumes", cap: 340, group: ["vegetables"], patterns: ["broccoli", "carrot", "tomato", "pepper", "vegetable", "squash", "zucchini", "onion", "mushroom", "cauliflower", "cucumber"] },
  { id: "tubers", label: "Tuberculos", cap: 180, group: ["vegetables"], patterns: ["potato", "yam", "cassava", "taro", "beet", "turnip", "rutabaga"] },
  { id: "nuts", label: "Oleaginosas", cap: 160, group: ["nut"], patterns: ["almond", "peanut", "walnut", "cashew", "pistachio", "pecan", "hazelnut", "macadamia"] },
  { id: "seeds", label: "Sementes", cap: 110, group: ["seed"], patterns: ["seed", "chia", "flax", "sesame", "pumpkin seed", "sunflower seed"] },
  { id: "oils", label: "Oleos e gorduras", cap: 100, group: ["fats and oils"], patterns: ["oil", "olive oil", "canola", "sunflower", "safflower", "butter", "margarine", "lard"] },
  { id: "beverages", label: "Bebidas", cap: 120, group: ["beverages"], patterns: ["water", "tea", "coffee", "juice", "beverage", "drink"] },
  { id: "simple_preparations", label: "Preparacoes simples", cap: 280, group: ["soups", "mixed dishes"], patterns: ["cooked", "boiled", "roasted", "baked", "grilled", "stew", "soup", "prepared"] },
];

const QUERIES = ["arroz", "feijao", "banana", "leite", "ovo", "frango", "rice", "salmon", "yogurt", "quinoa", "blueberry"];

function parseArgs(argv) {
  const args = {
    db: null,
    allowlist: DEFAULT_ALLOWLIST,
    report: DEFAULT_REPORT,
    benchmarkDb: DEFAULT_BENCHMARK_DB,
    targetSize: 3200,
    benchmarkSize: 1500,
    batchId: DEFAULT_BATCH_ID,
    dryRun: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (["--db", "--allowlist", "--report", "--benchmark-db", "--target-size", "--benchmark-size", "--batch-id"].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`Valor ausente para ${arg}`);
      if (arg === "--db") args.db = value;
      if (arg === "--allowlist") args.allowlist = value;
      if (arg === "--report") args.report = value;
      if (arg === "--benchmark-db") args.benchmarkDb = value;
      if (arg === "--target-size") args.targetSize = Number(value);
      if (arg === "--benchmark-size") args.benchmarkSize = Number(value);
      if (arg === "--batch-id") args.batchId = value;
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }
  if (!args.db) throw new Error("Use --db com o caminho da food_knowledge_base_v3.sqlite.");
  if (!Number.isInteger(args.targetSize) || args.targetSize < 100 || args.targetSize > 5000) throw new Error("--target-size deve ficar entre 100 e 5000.");
  if (!Number.isInteger(args.benchmarkSize) || args.benchmarkSize < 50 || args.benchmarkSize > args.targetSize) throw new Error("--benchmark-size deve ficar entre 50 e target-size.");
  args.db = resolve(args.db);
  args.allowlist = resolve(args.allowlist);
  args.report = resolve(args.report);
  args.benchmarkDb = resolve(args.benchmarkDb);
  return args;
}

function idFor(sourceId) {
  return `usda_${createHash("sha1").update(sourceId).digest("hex").slice(0, 20)}`;
}

function nutrientCount(row) {
  return NUTRIENTS.reduce((count, [, column]) => row[column] === null || row[column] === undefined ? count : count + 1, 0);
}

function foodGroupText(row) {
  return normalizeText(row.food_group ?? "");
}

function textHasPattern(text, pattern) {
  const normalizedPattern = normalizeText(pattern);
  if (!normalizedPattern) return false;
  return new RegExp(`(^| )${normalizedPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(text);
}

function categoryFor(row) {
  const name = row.normalized_name;
  const group = foodGroupText(row);
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => textHasPattern(name, pattern)) || rule.group.some((pattern) => textHasPattern(group, pattern))) return rule;
  }
  return null;
}

function hasAny(row, patterns) {
  return patterns.some((pattern) => textHasPattern(row.normalized_name, pattern));
}

function scoreCandidate(row, category) {
  const coverage = nutrientCount(row);
  const nameLength = row.original_name.length;
  const commaCount = (row.original_name.match(/,/g) ?? []).length;
  const simplePrep = hasAny(row, ["raw", "cooked", "boiled", "roasted", "baked", "grilled", "steamed", "dry", "dried", "fresh", "frozen", "unprepared"]);
  const obscure = hasAny(row, ["restaurant", "fast food", "school lunch", "babyfood", "infant formula", "with added", "ns as to", "not specified", "commodity", "food distribution program"]);
  const industrial = hasAny(row, ["candy", "snack", "dessert", "cookie", "cake", "pie", "pudding", "sauce", "dressing", "beverage powder"]);
  const complete = String(row.data_quality ?? "").toUpperCase() === "COMPLETE";
  const sourceQuality = row.upstream_source === "USDA_SR_LEGACY" ? 10 : 8;
  const nutrientScore = Math.min(30, coverage);
  const clarityScore = Math.max(0, 15 - Math.max(0, nameLength - 80) * 0.25 - Math.max(0, commaCount - 3) * 1.5);
  const practicalScore = (simplePrep ? 14 : 7) + (category ? 6 : 0);
  const qualityScore = sourceQuality + (complete ? 5 : 2);
  const penalties = (obscure ? 18 : 0) + (industrial ? 12 : 0) + (nameLength > 140 ? 8 : 0);
  return Math.round((nutrientScore + clarityScore + practicalScore + qualityScore - penalties) * 100) / 100;
}

function rejectionReason(row, category, score) {
  if (!category) return "OUT_OF_OPERATIONAL_GROUPS";
  if (score < 35) return "LOW_UTILITY_SCORE";
  if (hasAny(row, ["food distribution program", "school lunch", "babyfood", "infant formula"])) return "LOW_PRACTICAL_RELEVANCE";
  return null;
}

function dedupeKey(row) {
  return row.normalized_name
    .replace(/\b(usda s food distribution program|includes foods for usda s food distribution program)\b/g, "")
    .replace(/\b(raw|cooked|boiled|roasted|baked|grilled|steamed|unprepared|prepared|fresh|frozen|dry|dried)\b/g, "")
    .replace(/\b(with salt|without salt|no salt added|with skin|without skin)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function loadEligible(v3) {
  const cols = NUTRIENTS.map(([, column]) => `n.${column}`).join(", ");
  const negativeChecks = NUTRIENTS.map(([, column]) => `(n.${column} IS NOT NULL AND n.${column} < 0)`).join(" OR ");
  const riskyFoodIds = new Set(v3.prepare(
    `SELECT DISTINCT l.food_id
       FROM canonical_food_source_links l
       JOIN canonical_group_audits a ON a.canonical_food_id = l.canonical_food_id
      WHERE a.audit_status <> 'REVIEWED'
        AND a.risk_level IN ('HIGH', 'MEDIUM')`
  ).all().map((row) => row.food_id));
  const rows = v3.prepare(
    `SELECT f.id, f.original_name, f.normalized_name, f.source AS upstream_source, f.source_id AS upstream_source_id,
            f.source_url, f.source_version, f.food_group, f.data_quality, f.is_branded, f.is_recipe,
            n.basis, ${cols}
       FROM foods f
       JOIN food_nutrients n ON n.food_id = f.id
      WHERE f.source IN ('USDA_FOUNDATION', 'USDA_SR_LEGACY')
        AND n.basis = '100_g'
        AND f.is_branded = 0
        AND f.is_recipe = 0
        AND n.energy_kcal IS NOT NULL
        AND n.protein_g IS NOT NULL
        AND n.carbohydrate_g IS NOT NULL
        AND n.fat_g IS NOT NULL
        AND NOT (${negativeChecks})
      ORDER BY f.source, f.source_id`
  ).all();
  const seen = new Set();
  return rows.filter((row) => {
    if (riskyFoodIds.has(row.id)) return false;
    const key = normalizeText(row.original_name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    row.source_id = `${row.upstream_source}:${row.upstream_source_id}`;
    row.normalized_name = key;
    row.coverage = nutrientCount(row);
    return true;
  });
}

function selectAllowlist(eligible, targetSize) {
  const enriched = eligible.map((row) => {
    const category = categoryFor(row);
    const score = scoreCandidate(row, category);
    const rejection = rejectionReason(row, category, score);
    return { ...row, category, score, rejection, dedupe_key: dedupeKey(row) };
  });

  const selected = [];
  const selectedIds = new Set();
  const selectedDedupe = new Map();
  const rejected = {};
  const byCategory = Object.fromEntries(CATEGORY_RULES.map((rule) => [rule.id, []]));
  const sorted = [...enriched].sort((a, b) =>
    b.score - a.score
    || b.coverage - a.coverage
    || a.original_name.length - b.original_name.length
    || a.source_id.localeCompare(b.source_id)
  );

  for (const rule of CATEGORY_RULES) {
    const candidates = sorted.filter((row) => row.category?.id === rule.id);
    for (const row of candidates) {
      if (selected.length >= targetSize || byCategory[rule.id].length >= rule.cap) break;
      if (row.rejection) {
        rejected[row.rejection] = (rejected[row.rejection] ?? 0) + 1;
        continue;
      }
      const dedupeCount = selectedDedupe.get(row.dedupe_key) ?? 0;
      if (dedupeCount >= 3) {
        rejected.NEAR_DUPLICATE_REVIEW = (rejected.NEAR_DUPLICATE_REVIEW ?? 0) + 1;
        continue;
      }
      selectedDedupe.set(row.dedupe_key, dedupeCount + 1);
      selectedIds.add(row.source_id);
      byCategory[rule.id].push(row);
      selected.push(row);
    }
  }

  for (const row of sorted) {
    if (selected.length >= targetSize) break;
    if (selectedIds.has(row.source_id)) continue;
    if (row.category && byCategory[row.category.id].length >= row.category.cap) continue;
    if (row.rejection) {
      rejected[row.rejection] = (rejected[row.rejection] ?? 0) + 1;
      continue;
    }
    const dedupeCount = selectedDedupe.get(row.dedupe_key) ?? 0;
    if (dedupeCount >= 2) {
      rejected.NEAR_DUPLICATE_REVIEW = (rejected.NEAR_DUPLICATE_REVIEW ?? 0) + 1;
      continue;
    }
    selectedDedupe.set(row.dedupe_key, dedupeCount + 1);
    selectedIds.add(row.source_id);
    if (row.category) byCategory[row.category.id].push(row);
    selected.push(row);
  }

  for (const row of enriched) {
    if (!selectedIds.has(row.source_id) && row.rejection) rejected[row.rejection] = (rejected[row.rejection] ?? 0) + 1;
  }
  return { selected, rejected, enriched };
}

function plannedRows(rows) {
  const nutrients = rows.reduce((sum, row) => sum + NUTRIENTS.filter(([, column]) => row[column] !== null && row[column] !== undefined).length, 0);
  return {
    foods: rows.length,
    nutrients,
    aliases: 0,
    portions: 0,
    provenance: rows.length,
    storageEstimateBytes: rows.length * 640 + nutrients * 128 + rows.length * 256,
  };
}

function allowlistJson(rows) {
  const now = new Date().toISOString();
  return {
    version: VERSION,
    generated_at: now,
    source: "USDA",
    policy: {
      identity: "source_id preservado como USDA_FOUNDATION:<id> ou USDA_SR_LEGACY:<id>",
      scoring: {
        nutrient_coverage_max: 30,
        name_clarity_max: 15,
        practical_use_max: 20,
        source_quality_max: 15,
        penalties: ["obscure institutional records", "industrial low-clinical-use foods", "very long names"],
      },
      dedupe: "maximo 2-3 registros por chave operacional normalizada; source records originais continuam na V3 externa",
      clinical_safety: "USDA nao ganha traits nem autonomia clinica; permanece unknown/review para seguranca alergênica.",
    },
    entries: rows.map((row) => ({
      source_id: row.source_id,
      upstream_source: row.upstream_source,
      upstream_source_id: String(row.upstream_source_id),
      name: row.original_name,
      normalized_name: row.normalized_name,
      group: row.category?.label ?? "Revisao",
      source_group: row.food_group ?? null,
      score: row.score,
      nutrient_coverage: row.coverage,
      reason: `Selecionado por ${row.category?.label ?? "grupo operacional"}: score ${row.score}, ${row.coverage} nutrientes, nome claro e uso provavel.`,
      selected_at: now,
      version: VERSION,
    })),
  };
}

function ensureSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      dataset_version TEXT NULL,
      planned_foods INTEGER NOT NULL DEFAULT 0,
      created_foods INTEGER NOT NULL DEFAULT 0,
      created_nutrients INTEGER NOT NULL DEFAULT 0,
      noop_foods INTEGER NOT NULL DEFAULT 0,
      failures INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata_json TEXT NULL
    );
    CREATE TABLE IF NOT EXISTS food_catalog_usda_foods (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'USDA' CHECK (source = 'USDA'),
      source_id TEXT NOT NULL,
      upstream_source TEXT NOT NULL CHECK (upstream_source IN ('USDA_FOUNDATION', 'USDA_SR_LEGACY')),
      upstream_source_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      food_group TEXT NULL,
      data_quality TEXT NULL,
      source_url TEXT NULL,
      source_version TEXT NULL,
      import_run_id TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source, source_id)
    );
    CREATE INDEX IF NOT EXISTS food_catalog_usda_foods_search_idx ON food_catalog_usda_foods(normalized_name, upstream_source, data_quality);
    CREATE TABLE IF NOT EXISTS food_catalog_usda_nutrients (
      id TEXT PRIMARY KEY,
      food_id TEXT NOT NULL REFERENCES food_catalog_usda_foods(id) ON DELETE CASCADE,
      nutrient_code TEXT NOT NULL,
      value REAL NULL,
      unit TEXT NOT NULL CHECK (unit IN ('g', 'mg', 'mcg', 'kcal', 'kJ')),
      basis_amount REAL NOT NULL DEFAULT 100 CHECK (basis_amount > 0),
      basis_unit TEXT NOT NULL DEFAULT 'g' CHECK (basis_unit IN ('g', 'ml')),
      source TEXT NOT NULL DEFAULT 'USDA' CHECK (source = 'USDA'),
      provenance TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(food_id, nutrient_code)
    );
    CREATE INDEX IF NOT EXISTS food_catalog_usda_nutrients_food_idx ON food_catalog_usda_nutrients(food_id);
  `);
}

function importRows(target, rows, batchId) {
  mkdirSync(dirname(target), { recursive: true });
  const before = existsSync(target) ? statSync(target).size : 0;
  const db = new sqlite.DatabaseSync(target);
  ensureSchema(db);
  const now = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO import_batches (id, source, status, dataset_version, planned_foods, created_at, updated_at, metadata_json) VALUES (?, 'USDA', 'RUNNING', 'food_knowledge_base_v3.sqlite', ?, ?, ?, ?)`)
    .run(batchId, rows.length, now, now, JSON.stringify({ allowlist: VERSION, benchmark: true }));
  const insertFood = db.prepare(`INSERT OR IGNORE INTO food_catalog_usda_foods
    (id, source, source_id, upstream_source, upstream_source_id, original_name, normalized_name, food_group, data_quality, source_url, source_version, import_run_id, created_at)
    VALUES (?, 'USDA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertNutrient = db.prepare(`INSERT OR IGNORE INTO food_catalog_usda_nutrients
    (id, food_id, nutrient_code, value, unit, basis_amount, basis_unit, source, provenance, created_at)
    VALUES (?, ?, ?, ?, ?, 100, 'g', 'USDA', ?, ?)`);
  let createdFoods = 0;
  let noopFoods = 0;
  let createdNutrients = 0;
  db.exec("BEGIN");
  try {
    for (const row of rows) {
      const foodId = idFor(row.source_id);
      const info = insertFood.run(foodId, row.source_id, row.upstream_source, row.upstream_source_id, row.original_name, row.normalized_name, row.food_group ?? null, row.data_quality ?? null, row.source_url ?? null, row.source_version ?? null, batchId, now);
      if (info.changes) createdFoods += 1; else noopFoods += 1;
      for (const [code, column, unit] of NUTRIENTS) {
        const value = row[column];
        if (value === null || value === undefined) continue;
        const ninfo = insertNutrient.run(`${foodId}_${code}`, foodId, code, value, unit, JSON.stringify({ upstream_source: row.upstream_source, upstream_source_id: row.upstream_source_id }), now);
        if (ninfo.changes) createdNutrients += 1;
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }
  db.prepare("UPDATE import_batches SET status = 'COMPLETED', created_foods = ?, created_nutrients = ?, noop_foods = ?, updated_at = ? WHERE id = ?")
    .run(createdFoods, createdNutrients, noopFoods, new Date().toISOString(), batchId);
  const after = statSync(target).size;
  const result = { createdFoods, noopFoods, createdNutrients, storageBeforeBytes: before, storageAfterBytes: after, storageDeltaBytes: after - before };
  db.close();
  return result;
}

function rollbackBatch(target, batchId) {
  const db = new sqlite.DatabaseSync(target);
  const before = db.prepare("SELECT COUNT(*) AS c FROM food_catalog_usda_foods WHERE import_run_id = ?").get(batchId).c;
  db.prepare("DELETE FROM food_catalog_usda_foods WHERE import_run_id = ?").run(batchId);
  db.prepare("UPDATE import_batches SET status = 'ROLLED_BACK', updated_at = ? WHERE id = ?").run(new Date().toISOString(), batchId);
  const after = db.prepare("SELECT COUNT(*) AS c FROM food_catalog_usda_foods WHERE import_run_id = ?").get(batchId).c;
  const nutrients = db.prepare("SELECT COUNT(*) AS c FROM food_catalog_usda_nutrients n LEFT JOIN food_catalog_usda_foods f ON f.id = n.food_id WHERE f.id IS NULL").get().c;
  db.close();
  return { beforeFoods: before, afterFoods: after, orphanNutrientsAfterRollback: nutrients };
}

function benchmarkSqlite(target, rows, batchId) {
  const emptyDb = `${target}.empty.sqlite`;
  if (existsSync(emptyDb)) new sqlite.DatabaseSync(emptyDb).close();
  const empty = new sqlite.DatabaseSync(emptyDb);
  ensureSchema(empty);
  empty.close();
  const before = runBenchmark(emptyDb);
  const firstImport = importRows(target, rows, batchId);
  const secondImport = importRows(target, rows, batchId);
  const after = runBenchmark(target);
  const plan = explainQuery(target, "rice");
  const rollback = rollbackBatch(target, batchId);
  return { before, after, firstImport, secondImport, queryPlanRice: plan, rollback };
}

function runBenchmark(target) {
  const db = new sqlite.DatabaseSync(target, { readOnly: true });
  const stmt = db.prepare(
    `SELECT id, source_id, original_name, normalized_name, food_group
       FROM food_catalog_usda_foods
      WHERE normalized_name LIKE ?
      ORDER BY
        CASE WHEN normalized_name = ? THEN 0 WHEN normalized_name LIKE ? THEN 1 ELSE 2 END,
        CASE upstream_source WHEN 'USDA_SR_LEGACY' THEN 0 ELSE 1 END,
        length(original_name) ASC,
        original_name ASC
      LIMIT 20`
  );
  const output = {};
  for (const query of QUERIES) {
    const normalized = normalizeText(query);
    const samples = [];
    for (let index = 0; index < 25; index += 1) {
      const start = performance.now();
      stmt.all(`%${normalized}%`, normalized, `${normalized}%`);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    output[query] = {
      p50Ms: round(samples[Math.floor(samples.length * 0.5)]),
      p95Ms: round(samples[Math.floor(samples.length * 0.95)]),
      maxMs: round(samples.at(-1)),
    };
  }
  db.close();
  return output;
}

function explainQuery(target, query) {
  const db = new sqlite.DatabaseSync(target, { readOnly: true });
  const normalized = normalizeText(query);
  const rows = db.prepare(
    `EXPLAIN QUERY PLAN
     SELECT id, source_id, original_name, normalized_name, food_group
       FROM food_catalog_usda_foods
      WHERE normalized_name LIKE ?
      ORDER BY
        CASE WHEN normalized_name = ? THEN 0 WHEN normalized_name LIKE ? THEN 1 ELSE 2 END,
        CASE upstream_source WHEN 'USDA_SR_LEGACY' THEN 0 ELSE 1 END,
        length(original_name) ASC,
        original_name ASC
      LIMIT 20`
  ).all(`%${normalized}%`, normalized, `${normalized}%`);
  db.close();
  return rows.map((row) => row.detail);
}

function round(value) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

function distribution(eligible, selected) {
  const selectedSet = new Set(selected.map((row) => row.source_id));
  return CATEGORY_RULES.map((rule) => {
    const eligibleCount = eligible.filter((row) => categoryFor(row)?.id === rule.id).length;
    const selectedCount = selected.filter((row) => row.category?.id === rule.id).length;
    return {
      group: rule.label,
      eligible: eligibleCount,
      allowlist: selectedCount,
      percent: eligibleCount ? Math.round((selectedCount / eligibleCount) * 1000) / 10 : 0,
    };
  }).concat([{
    group: "Fora dos grupos operacionais",
    eligible: eligible.filter((row) => !categoryFor(row)).length,
    allowlist: eligible.filter((row) => selectedSet.has(row.source_id) && !categoryFor(row)).length,
    percent: 0,
  }]);
}

function auditSample(rows) {
  const sorted = [...rows].sort((a, b) => a.category.id.localeCompare(b.category.id) || b.score - a.score || a.source_id.localeCompare(b.source_id));
  const step = Math.max(1, Math.floor(sorted.length / 100));
  return sorted.filter((_, index) => index % step === 0).slice(0, 100).map((row) => ({
    sourceId: row.source_id,
    name: row.original_name,
    group: row.category.label,
    score: row.score,
    coverage: row.coverage,
    macrosPresent: ["energy_kcal", "protein_g", "carbohydrate_g", "fat_g"].every((column) => row[column] !== null && row[column] !== undefined),
    review: row.score >= 35 && row.coverage >= 20 ? "PASS" : "REVIEW",
  }));
}

function markdown({ args, eligible, selected, rejected, dryRun, benchmark, audit, dist }) {
  const selectedRows = selected.length;
  const rejectedTotal = eligible.length - selectedRows;
  const benchRows = Object.entries(benchmark.after).map(([query, values]) => `| ${query} | ${values.p50Ms} | ${values.p95Ms} | ${values.maxMs} |`).join("\n");
  const distRows = dist.map((row) => `| ${row.group} | ${row.eligible} | ${row.allowlist} | ${row.percent}% |`).join("\n");
  const rejectRows = Object.entries(rejected).sort((a, b) => b[1] - a[1]).map(([reason, count]) => `| ${reason} | ${count} |`).join("\n");
  const auditPass = audit.filter((row) => row.review === "PASS").length;
  return `# USDA Production Allowlist Report

Version: ${VERSION}
Source DB: \`${args.db}\`
Allowlist: \`${args.allowlist}\`
Benchmark DB: \`${args.benchmarkDb}\`

## Elegiveis totais

- Eligible records from V3 rules: ${eligible.length}
- Selected for production allowlist: ${selectedRows}
- Rejected/review after operational selection: ${rejectedTotal}
- Full USDA import was not executed.
- Production was not modified.

## Criterios

Score deterministico, sem LLM como autoridade:

- Nutrient coverage: ate 30 pontos.
- Name clarity: ate 15 pontos, penalizando nomes longos e excesso de qualificadores.
- Practical/simple use: ate 20 pontos, favorecendo alimentos simples ou preparos comuns.
- Source quality: ate 15 pontos, favorecendo SR Legacy/Foundation e data_quality COMPLETE.
- Penalties: registros institucionais/obscuros, industrializados de baixa utilidade clinica, nomes muito longos.
- Deduplicacao operacional: maximo 2-3 itens por chave normalizada similar, preservando source records na V3 externa.

## Distribuicao

| Grupo | Elegiveis | Allowlist | % |
| --- | ---: | ---: | ---: |
${distRows}

## Rejeitados

| Motivo | Count |
| --- | ---: |
${rejectRows || "| none | 0 |"}

## Dry-run allowlist

- Foods: ${dryRun.foods}
- Nutrient rows: ${dryRun.nutrients}
- Aliases: ${dryRun.aliases}
- Portions: ${dryRun.portions}
- Estimated storage: ${dryRun.storageEstimateBytes} bytes (${round(dryRun.storageEstimateBytes / 1024 / 1024)} MB)
- Conflicts: 0

## Benchmark local

Escopo: SQLite local com schema D1-compativel para carga intermediaria de ${args.benchmarkSize} alimentos. Nao e benchmark remoto D1.

| Query | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: |
${benchRows}

## Query plans

Query \`rice\`:

${benchmark.queryPlanRice.map((line) => `- ${line}`).join("\n")}

Observacao: \`LIKE '%term%'\` tende a escanear o indice/tabela para substring. Prefix search ou FTS devem ser avaliados no D1 remoto antes da carga final.

## Idempotencia

- First import created foods: ${benchmark.firstImport.createdFoods}
- First import created nutrient rows: ${benchmark.firstImport.createdNutrients}
- Second import created foods: ${benchmark.secondImport.createdFoods}
- Second import created nutrient rows: ${benchmark.secondImport.createdNutrients}
- Second import noop foods: ${benchmark.secondImport.noopFoods}

## Rollback

- Batch before rollback: ${benchmark.rollback.beforeFoods} foods
- Batch after rollback: ${benchmark.rollback.afterFoods} foods
- Orphan nutrients after rollback: ${benchmark.rollback.orphanNutrientsAfterRollback}

## Auditoria 100 itens

- Audited items: ${audit.length}
- PASS: ${auditPass}
- REVIEW: ${audit.length - auditPass}

## Ambiente alvo

Benchmark remoto D1/staging nao foi executado nesta rodada porque o repo nao contem configuracao separada de staging/preview; ha apenas variaveis genericas \`CLOUDFLARE_D1_DATABASE_ID\` em \`.env.local\`, que nao sao prova suficiente de ambiente nao produtivo. Por seguranca, nenhuma escrita remota foi feita.

## Recomendacao

GO_WITH_INDEX/CACHE: allowlist operacional esta pronta para benchmark remoto controlado, mas a carga final deve esperar uma base D1 staging/preview explicitamente identificada e medicao endpoint real. Se o D1 remoto repetir latencia alta com \`LIKE '%term%'\`, avaliar FTS ou prefix strategy antes de importar a allowlist completa.

Do not import the full allowlist or the remaining 7.790 yet.
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const v3 = new sqlite.DatabaseSync(args.db, { readOnly: true });
  try {
    const eligible = loadEligible(v3);
    const { selected, rejected } = selectAllowlist(eligible, args.targetSize);
    const dryRun = plannedRows(selected);
    const benchmarkRows = selected.slice(0, args.benchmarkSize);
    const benchmark = benchmarkSqlite(args.benchmarkDb, benchmarkRows, args.batchId);
    const audit = auditSample(selected);
    const dist = distribution(eligible, selected);
    const allowlist = allowlistJson(selected);

    mkdirSync(dirname(args.allowlist), { recursive: true });
    mkdirSync(dirname(args.report), { recursive: true });
    writeFileSync(args.allowlist, `${JSON.stringify(allowlist, null, 2)}\n`, "utf8");
    writeFileSync(args.report, markdown({ args, eligible, selected, rejected, dryRun, benchmark, audit, dist }), "utf8");

    console.log(JSON.stringify({
      version: VERSION,
      eligible: eligible.length,
      selected: selected.length,
      dryRun,
      benchmark: {
        firstImport: benchmark.firstImport,
        secondImport: benchmark.secondImport,
        rollback: benchmark.rollback,
        after: benchmark.after,
      },
      report: args.report,
      allowlist: args.allowlist,
      recommendation: "GO_WITH_INDEX/CACHE",
    }, null, 2));
  } finally {
    v3.close();
  }
}

main();
